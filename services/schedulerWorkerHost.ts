import { parentPort, workerData } from 'worker_threads';
import { HeuristicConfig } from '../types';
import { calculateScheduleScore, generateScheduleWithHeuristics, SchedulerResult } from './heuristicScheduler';

type WorkerPayload = {
    data: any;
    config: HeuristicConfig;
    seeds?: Array<number | string>;
};

const run = async () => {
    const payload = workerData as WorkerPayload;
    const seeds = payload.seeds?.length ? payload.seeds : [payload.config.seed ?? Date.now()];
    let bestResult: SchedulerResult | null = null;

    for (const seed of seeds) {
        const config = { ...payload.config, seed };
        const result = await generateScheduleWithHeuristics(payload.data, config);
        const score = result.score ?? calculateScheduleScore(payload.data, result, config);
        const response: SchedulerResult = { ...result, score };
        if (!bestResult || response.score!.total < (bestResult.score?.total ?? Number.POSITIVE_INFINITY)) {
            bestResult = response;
        }
    }

    parentPort?.postMessage({ ok: true, result: bestResult });
};

run().catch(error => {
    parentPort?.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
    });
});
