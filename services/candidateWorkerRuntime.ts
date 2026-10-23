import { createCandidateScorer } from './heuristicScheduler';
import type { ScheduleEntry } from '../types';

export const candidateWorkerHandler = (postMessage: (message: unknown) => void) => {
    let score: ReturnType<typeof createCandidateScorer>;
    const entries = new Map<string, ScheduleEntry>();
    let schedule: ScheduleEntry[] = [];
    let revision = 0;
    return (message: any) => {
        try {
            if (message.type === 'initialize') {
                score = createCandidateScorer(message.data, message.config);
                entries.clear(); schedule = []; revision = 0;
            } else if (message.type === 'sync') {
                if (message.revision !== revision + 1) throw new Error('Out-of-order candidate snapshot.');
                for (const id of message.removed) entries.delete(id);
                for (const entry of message.changes) entries.set(entry.id, entry);
                schedule = message.order ? message.order.map((id: string) => entries.get(id)!) : schedule.map(entry => entries.get(entry.id)!);
                revision = message.revision;
            } else if (message.type === 'evaluate') {
                if (!score || message.revision !== revision) throw new Error('Stale candidate snapshot.');
                const costs = score(message.entry, schedule, message.candidates, message.excludedId);
                postMessage({ type: 'costs', id: message.id, revision, costs });
            }
        } catch (error) {
            postMessage({ type: 'error', id: message.id, error: error instanceof Error ? error.message : String(error) });
        }
    };
};
