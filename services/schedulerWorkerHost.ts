import { parentPort, workerData } from 'worker_threads';
import { HeuristicConfig } from '../types';
import { calculateScheduleScore, generateScheduleWithHeuristics, SchedulerResult } from './heuristicScheduler';

type WorkerPayload = {
    data: any;
    config: HeuristicConfig;
};

const run = async () => {
    const payload = workerData as WorkerPayload;
    const result = await generateScheduleWithHeuristics(payload.data, payload.config);
    const score = result.score ?? calculateScheduleScore(payload.data, result, payload.config);
    const response: SchedulerResult = { ...result, score };
    parentPort?.postMessage({ ok: true, result: response });
};

run().catch(error => {
    parentPort?.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
    });
});
