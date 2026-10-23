import { runIterativeScheduler } from './iterativeScheduler';
import { generateScheduleWithHeuristics } from './heuristicScheduler';
import { CandidatePool } from './candidatePool';

const workerScope = globalThis as unknown as {
    onmessage: (event: MessageEvent) => void;
    postMessage: (message: unknown) => void;
};
let stopRequested = false;
workerScope.onmessage = async event => {
    if (event.data.type === 'stop') { stopRequested = true; return; }
    if (event.data.type !== 'start' && event.data.type !== 'start-iteration') return;
    stopRequested = false;
    const candidateEvaluator = event.data.candidateWorkers >= 2 ? new CandidatePool(event.data.candidateWorkers,
        () => new Worker(new URL('schedulerCandidateBrowserWorker.js', globalThis.location.href).href)) : undefined;
    try {
        const result = event.data.type === 'start-iteration' ? await generateScheduleWithHeuristics(event.data.data, event.data.config, {
            candidateEvaluator,
            onProgress: progress => workerScope.postMessage({ type: 'progress', progress }), shouldStop: () => stopRequested,
        }) : await runIterativeScheduler(event.data.data, event.data.config,
            progress => workerScope.postMessage({ type: 'iteration', progress }), {
                onProgress: progress => workerScope.postMessage({ type: 'progress', progress }),
                shouldStop: () => stopRequested,
            });
        workerScope.postMessage({ type: 'result', result, candidateMetrics: candidateEvaluator?.metrics });
    } catch (error) {
        workerScope.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
    }
};
