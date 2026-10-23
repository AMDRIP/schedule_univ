import { parentPort, workerData, Worker } from 'worker_threads';
import path from 'path';
import { HeuristicConfig } from '../types';
import { calculateScheduleScore, generateScheduleWithHeuristics, SchedulerResult } from './heuristicScheduler';
import { CandidatePool, CandidateWorker } from './candidatePool';

type WorkerPayload = {
    data: any;
    config: HeuristicConfig;
    seeds?: Array<number | string>;
    candidateWorkers?: number;
};

const run = async () => {
    const payload = workerData as WorkerPayload;
    const seeds = payload.seeds?.length ? payload.seeds : [payload.config.seed ?? Date.now()];
    let bestResult: SchedulerResult | null = null;
    const candidateMetrics: unknown[] = [];

    for (const seed of seeds) {
        const config = { ...payload.config, seed };
        const candidateEvaluator = (payload.candidateWorkers || 0) >= 2 ? new CandidatePool(payload.candidateWorkers!, () => {
            const worker = new Worker(path.join(__dirname, 'schedulerCandidateNodeWorker.js'));
            const adapter: CandidateWorker = { onmessage: null, onerror: null, postMessage: message => worker.postMessage(message), terminate: () => worker.terminate() };
            worker.on('message', data => adapter.onmessage?.({ data }));
            worker.on('error', error => adapter.onerror?.({ message: error.message }));
            worker.on('exit', code => { if (code) adapter.onerror?.({ message: `Candidate worker exited: ${code}` }); });
            return adapter;
        }) : undefined;
        const result = await generateScheduleWithHeuristics(payload.data, config, { candidateEvaluator });
        if (candidateEvaluator) candidateMetrics.push(candidateEvaluator.metrics);
        const score = result.score ?? calculateScheduleScore(payload.data, result, config);
        const response: SchedulerResult = { ...result, score };
        if (!bestResult || response.score!.total < (bestResult.score?.total ?? Number.POSITIVE_INFINITY)) {
            bestResult = response;
        }
    }

    parentPort?.postMessage({ ok: true, result: bestResult, candidateMetrics });
};

run().catch(error => {
    parentPort?.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
    });
});
