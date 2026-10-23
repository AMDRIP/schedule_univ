import type { CandidateEvaluator, GenerationData, PlacementCandidate } from './heuristicScheduler';
import type { HeuristicConfig, ScheduleEntry, UnscheduledEntry } from '../types';

export interface CandidateWorker {
    onmessage: ((event: { data: any }) => void) | null;
    onerror: ((event: { message?: string }) => void) | null;
    postMessage(message: unknown): void;
    terminate(): unknown;
}

export const candidateWorkerBudget = (budget: number, iterations: number) => {
    const spare = Math.floor(budget / Math.max(1, iterations)) - 1;
    return spare >= 2 ? Math.min(7, spare) : 0;
};

export class CandidatePool implements CandidateEvaluator {
    private workers: CandidateWorker[] = [];
    private pending = new Map<number, { revision: number; resolve: (costs: number[]) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    private snapshot = new Map<string, ScheduleEntry>();
    private order: string[] = [];
    private revision = 0;
    private nextJob = 0;
    private disabled = false;
    private busy = false;
    private data?: GenerationData;
    private config?: HeuristicConfig;
    readonly metrics = { workers: 0, batches: 0, candidates: 0, changedEntries: 0, fallbacks: 0 };

    constructor(private size: number, private factory: () => CandidateWorker, private timeoutMs = 30_000) {}

    async initialize(data: GenerationData, config: HeuristicConfig) {
        this.data = data;
        this.config = config;
    }

    private fail(error: Error) {
        if (!this.disabled) {
            this.disabled = true;
            this.metrics.fallbacks++;
            console.warn('Parallel candidate scoring unavailable; using the coordinator.', error.message);
        }
        for (const job of this.pending.values()) { clearTimeout(job.timer); job.reject(error); }
        this.pending.clear();
        for (const worker of this.workers) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
        this.workers = [];
    }

    private start() {
        if (!this.data || !this.config) throw new Error('Candidate pool is not initialized.');
        for (let i = 0; i < this.size; i++) {
            const worker = this.factory();
            this.workers.push(worker);
            worker.onmessage = event => {
                const message = event.data;
                if (message.type === 'error') { this.fail(new Error(message.error || 'Candidate worker failed.')); return; }
                const job = this.pending.get(message.id);
                if (!job) return;
                if (message.revision !== job.revision || !Array.isArray(message.costs) || message.costs.some(cost => typeof cost !== 'number' || (cost !== Infinity && !Number.isFinite(cost)))) {
                    this.fail(new Error('Invalid or stale candidate worker result.')); return;
                }
                clearTimeout(job.timer); this.pending.delete(message.id); job.resolve(message.costs);
            };
            worker.onerror = event => this.fail(new Error(event.message || 'Candidate worker failed.'));
            worker.postMessage({ type: 'initialize', data: this.data, config: this.config });
            this.metrics.workers++;
        }
    }

    async evaluate(entry: UnscheduledEntry, schedule: ScheduleEntry[], candidates: PlacementCandidate[], excludedId?: string): Promise<number[] | undefined> {
        if (this.disabled || this.busy || !candidates.length) return undefined;
        this.busy = true;
        try {
            if (!this.workers.length) this.start();
            const snapshot = new Map(schedule.map(item => [item.id, item]));
            const changes = schedule.filter(item => this.snapshot.get(item.id) !== item);
            const removed = [...this.snapshot.keys()].filter(id => !snapshot.has(id));
            const order = schedule.map(item => item.id);
            const reordered = order.length !== this.order.length || order.some((id, index) => id !== this.order[index]);
            if (changes.length || removed.length || reordered) {
                this.revision++;
                for (const worker of this.workers) worker.postMessage({ type: 'sync', revision: this.revision, changes, removed, order: reordered ? order : undefined });
                this.snapshot = snapshot; this.order = order;
                this.metrics.changedEntries += changes.length;
            }
            const chunkSize = Math.ceil(candidates.length / this.workers.length);
            const jobs: Promise<number[]>[] = [];
            for (let i = 0; i < this.workers.length && i * chunkSize < candidates.length; i++) {
                const id = ++this.nextJob;
                const chunk = candidates.slice(i * chunkSize, (i + 1) * chunkSize);
                jobs.push(new Promise((resolve, reject) => {
                    const timer = setTimeout(() => this.fail(new Error('Candidate worker timed out.')), this.timeoutMs);
                    this.pending.set(id, { revision: this.revision, resolve, reject, timer });
                    try { this.workers[i].postMessage({ type: 'evaluate', id, revision: this.revision, entry, candidates: chunk, excludedId }); }
                    catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
                }));
            }
            const costs = (await Promise.all(jobs)).flat();
            if (costs.length !== candidates.length) throw new Error('Incomplete candidate worker result.');
            this.metrics.batches++; this.metrics.candidates += candidates.length;
            return costs;
        } catch (error) {
            this.fail(error instanceof Error ? error : new Error(String(error)));
            return undefined;
        } finally {
            this.busy = false;
        }
    }

    dispose() {
        if (this.pending.size) this.fail(new Error('Candidate pool disposed.'));
        for (const worker of this.workers) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
        this.workers = []; this.disabled = true;
        this.snapshot.clear(); this.order = []; this.data = undefined; this.config = undefined;
    }
}
