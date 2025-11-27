import { 
    ScheduleEntry, UnscheduledEntry, HeuristicConfig 
} from '../types';
import { generateScheduleWithHeuristics, SchedulerResult } from './heuristicScheduler';

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
    onProgress: (progress: { current: number, total: number }) => void
): Promise<SchedulerResult> => {
    
    let bestResult: SchedulerResult | null = null;
    let lowestUnscheduledCount = Infinity;

    for (let i = 1; i <= config.iterations; i++) {
        // Use a slight delay to allow UI to update if needed, and to avoid blocking the main thread too hard
        await new Promise(resolve => setTimeout(resolve, 50)); 
        
        onProgress({ current: i, total: config.iterations });

        // Run the stochastic heuristic. It's important that this function is non-deterministic.
        const currentResult = await generateScheduleWithHeuristics(data, config);
        
        // The "best" schedule is the one with the fewest unscheduled entries.
        // Secondary metrics (like total cost of soft constraints) could be added here.
        if (currentResult.unschedulable.length < lowestUnscheduledCount) {
            lowestUnscheduledCount = currentResult.unschedulable.length;
            bestResult = currentResult;
            console.log(`New best result found at iteration ${i}: ${lowestUnscheduledCount} unscheduled.`);
        }

        // If a perfect schedule is found (0 unscheduled), we can stop early.
        if (lowestUnscheduledCount === 0) {
            console.log(`Optimal solution found at iteration ${i}. Stopping early.`);
            onProgress({ current: config.iterations, total: config.iterations }); // Mark as complete
            break;
        }
    }

    // Fallback in case no iterations produced a valid result (highly unlikely)
    if (!bestResult) {
        return { schedule: [], unschedulable: [] };
    }

    return bestResult;
};