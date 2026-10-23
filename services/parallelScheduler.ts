import { HeuristicConfig } from '../types';
import { GenerationData, SchedulerResult, SchedulerRunOptions } from './heuristicScheduler';
import { candidateWorkerBudget } from './candidatePool';

export const chooseWorkerCount = (iterations: number, requested = 0, logicalCores = 2, memoryGiB?: number) => {
    const safe = memoryGiB && memoryGiB <= 4 ? 2 : 4;
    const automatic = Math.min(safe, Math.max(1, logicalCores - 2));
    return Math.max(1, Math.min(Math.max(1, Math.floor(iterations)), requested > 0 ? Math.floor(requested) : automatic, 8, Math.max(1, logicalCores)));
};
export const runWorkerPool = (data: GenerationData, config: HeuristicConfig, onIteration: (progress: { current: number; total: number }) => void, options: SchedulerRunOptions = {}, factory = () => new Worker(new URL('dist/schedulerBrowserWorker.js', window.location.href).href)): Promise<SchedulerResult> => new Promise((resolve, reject) => {
    const iterations = Math.max(1, Math.min(100, Math.floor(config.iterations || 1)));
    const hardware = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
    const memory = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const size = chooseWorkerCount(iterations, config.parallelWorkers, hardware, memory);
    const candidateWorkers = candidateWorkerBudget(chooseWorkerCount(8, config.parallelWorkers, hardware, memory), size);
    const workers: Worker[] = []; const frames = new Map<Worker, Parameters<NonNullable<SchedulerRunOptions['onProgress']>>[0]>();
    let next = 1; let completed = 0; let active = 0; let stopped = false; let settled = false;
    let best: SchedulerResult | undefined; let failure: Error | undefined; let stopTimer: ReturnType<typeof setInterval>;
    const start = Date.now(); const seed = config.seed ?? Date.now();
    const cleanup = () => { clearInterval(stopTimer); for (const worker of workers) { worker.onmessage = null; worker.onerror = null; worker.terminate(); } };
    const finish = () => {
        if (settled) return;
        if (active || (!stopped && next <= iterations)) return;
        settled = true; cleanup();
        if (best) resolve({ ...best, interrupted: stopped || best.interrupted });
        else reject(failure || new Error('Ни одна итерация не вернула результат.'));
    };
    const startJob = (worker: Worker) => {
        if (stopped || next > iterations) { finish(); return; }
        const job = next++; active++; frames.delete(worker);
        worker.postMessage({ type: 'start-iteration', data, candidateWorkers, config: { ...config, iterations: 1, seed: `${seed}-${job}`, stochasticity: config.stochasticity ?? 0.35 } });
    };
    const requestStop = () => {
        if (stopped || settled) return;
        stopped = true; for (const worker of workers) worker.postMessage({ type: 'stop' }); finish();
    };
    try {
        onIteration({ current: 0, total: iterations });
        for (let index = 0; index < size; index++) {
            const worker = factory(); workers.push(worker);
            let running = false;
            const launch = () => { if (!stopped && next <= iterations) { running = true; startJob(worker); } else finish(); };
            const failed = (error: Error) => {
                if (settled || !running) return;
                running = false; active--; completed++; frames.delete(worker); failure = error; worker.terminate();
                // Do not replace a verified result with an empty or failed run.
                if (workers.every(item => item === worker || !item.onmessage)) stopped = true;
                worker.onmessage = null; worker.onerror = null;
                if (active === 0) { stopped = true; finish(); }
            };
            worker.onmessage = event => {
                if (settled || !running) return;
                const message = event.data;
                if (message.type === 'progress') {
                    frames.set(worker, message.progress);
                    const measured = [...frames.values()].sort((a, b) => a.penalty - b.penalty)[0];
                    if (measured) options.onProgress?.({ ...measured, phase: stopped ? 'stopping' : measured.phase === 'completed' ? 'refining' : measured.phase, timeMs: Date.now() - start, label: `Итераций параллельно: ${size}. Исполнителей оценки на итерацию: ${candidateWorkers || 1}. Завершено: ${completed}/${iterations}. ${measured.label}` });
                }
                if (message.type === 'error') { failed(new Error(message.error)); return; }
                if (message.type === 'result') {
                    running = false; active--; completed++; frames.delete(worker);
                    const candidate: SchedulerResult = message.result;
                    if (!candidate?.score || !Number.isFinite(candidate.score.total)) failure = new Error('Worker вернул некорректную оценку.');
                    else if (!best || candidate.score.total < best.score!.total) best = candidate;
                    onIteration({ current: completed, total: iterations });
                    if (options.shouldStop?.()) requestStop();
                    launch(); finish();
                }
            };
            worker.onerror = event => failed(new Error(event.message || 'Ошибка фоновой итерации.'));
            launch();
        }
        stopTimer = setInterval(() => { if (options.shouldStop?.()) requestStop(); }, 100);
    } catch (error) { settled = true; cleanup(); reject(error); }
});
