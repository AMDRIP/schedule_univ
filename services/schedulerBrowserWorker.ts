import { runIterativeScheduler } from './iterativeScheduler';
import { generateScheduleWithHeuristics } from './heuristicScheduler';

const workerScope = globalThis as unknown as {
    onmessage: (event: MessageEvent) => void;
    postMessage: (message: unknown) => void;
};
let stopRequested = false;
workerScope.onmessage = async event => {
    if (event.data.type === 'stop') { stopRequested = true; return; }
    if (event.data.type !== 'start' && event.data.type !== 'start-iteration') return;
    stopRequested = false;
    try {
        const result = event.data.type === 'start-iteration' ? await generateScheduleWithHeuristics(event.data.data, event.data.config, {
            onProgress: progress => workerScope.postMessage({ type: 'progress', progress }), shouldStop: () => stopRequested,
        }) : await runIterativeScheduler(event.data.data, event.data.config,
            progress => workerScope.postMessage({ type: 'iteration', progress }), {
                onProgress: progress => workerScope.postMessage({ type: 'progress', progress }),
                shouldStop: () => stopRequested,
            });
        workerScope.postMessage({ type: 'result', result });
    } catch (error) {
        workerScope.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
    }
};
