import { 
    ScheduleEntry, UnscheduledEntry, HeuristicConfig 
} from '../types';
import { calculateScheduleScore, generateScheduleWithHeuristics, SchedulerResult, SchedulerRunOptions } from './heuristicScheduler';

// The full GenerationData type is complex, so we'll just accept 'any' for simplicity in this new file
// as it's just passing it through. A better approach would be to define GenerationData in types.ts.
// For now, this is sufficient.
type GenerationData = any;

/**
 * Runs the stochastic heuristic scheduler multiple times to find a better solution.
 * @param data - The full dataset for the scheduler.
 * @param config - The heuristic configuration, including the number of iterations.
 * @param onProgress - A callback function to report progress (e.g., { current: 1, total: 10 }).
 * @returns The best scheduler result found after all iterations.
 */
export const runIterativeScheduler = async (
    data: GenerationData,
    config: HeuristicConfig,
    onProgress: (progress: { current: number, total: number }) => void,
    options: SchedulerRunOptions = {}
): Promise<SchedulerResult> => {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
        return new Promise<SchedulerResult>((resolve, reject) => {
            const worker = new Worker(new URL('dist/schedulerBrowserWorker.js', window.location.href).href);
            const stopTimer = setInterval(() => { if (options.shouldStop?.()) worker.postMessage({ type: 'stop' }); }, 100);
            const cleanup = () => { clearInterval(stopTimer); worker.terminate(); };
            worker.onmessage = event => {
                const message = event.data;
                if (message.type === 'iteration') onProgress(message.progress);
                if (message.type === 'progress') options.onProgress?.(message.progress);
                if (message.type === 'result') { cleanup(); resolve(message.result); }
                if (message.type === 'error') { cleanup(); reject(new Error(message.error)); }
            };
            worker.onerror = event => { cleanup(); reject(new Error(event.message || 'Не удалось запустить фоновый планировщик.')); };
            worker.postMessage({ type: 'start', data, config });
        });
    }
    if (!options.onProgress && !options.shouldStop && typeof window !== 'undefined' && window.electronAPI?.runParallelScheduler && config.iterations > 1) {
        try {
            onProgress({ current: 0, total: config.iterations });
            const parallelResult = await window.electronAPI.runParallelScheduler(data, config);
            if (parallelResult) {
                onProgress({ current: config.iterations, total: config.iterations });
                return parallelResult as SchedulerResult;
            }
        } catch (error) {
            console.warn('Parallel scheduler failed, falling back to sequential mode:', error);
        }
    }
    
    let bestResult: SchedulerResult | null = null;
    let lowestScore = Infinity;
    const baseSeed = config.seed ?? Date.now();
    const startedAt = Date.now();

    for (let i = 1; i <= config.iterations; i++) {
        if (options.shouldStop?.() && bestResult) return { ...bestResult, interrupted: true };
        // Use a slight delay to allow UI to update if needed, and to avoid blocking the main thread too hard
        await new Promise(resolve => setTimeout(resolve, 50)); 
        
        onProgress({ current: i, total: config.iterations });

        const currentConfig: HeuristicConfig = {
            ...config,
            seed: `${baseSeed}-${i}`,
            stochasticity: config.stochasticity ?? 0.35,
        };
        const currentResult = await generateScheduleWithHeuristics(data, currentConfig, { ...options, onProgress: options.onProgress ? progress => options.onProgress!({ ...progress, phase: progress.phase === 'completed' ? 'refining' : progress.phase, timeMs: Date.now() - startedAt, label: `Итерация ${i}/${config.iterations}. ${progress.label}` }) : undefined });
        const currentScore = currentResult.score ?? calculateScheduleScore(data, currentResult, currentConfig);
        
        if (currentScore.total < lowestScore) {
            lowestScore = currentScore.total;
            bestResult = { ...currentResult, score: currentScore };
            console.log(`New best result found at iteration ${i}: score=${currentScore.total.toFixed(2)}, unscheduled=${currentScore.unscheduled}, hard=${currentScore.hardViolations}.`);
        }
        if (currentResult.interrupted) return { ...(bestResult || currentResult), interrupted: true };
    }

    // Fallback in case no iterations produced a valid result (highly unlikely)
    if (!bestResult) {
    return { schedule: [], unschedulable: [], explanations: {} };
    }

    return bestResult;
};
