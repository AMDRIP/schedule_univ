import { 
    ScheduleEntry, UnscheduledEntry, HeuristicConfig 
} from '../types';
import { calculateScheduleScore, generateScheduleWithHeuristics, SchedulerResult } from './heuristicScheduler';

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
    if (typeof window !== 'undefined' && window.electronAPI?.runParallelScheduler && config.iterations > 1) {
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

    for (let i = 1; i <= config.iterations; i++) {
        // Use a slight delay to allow UI to update if needed, and to avoid blocking the main thread too hard
        await new Promise(resolve => setTimeout(resolve, 50)); 
        
        onProgress({ current: i, total: config.iterations });

        const currentConfig: HeuristicConfig = {
            ...config,
            seed: `${baseSeed}-${i}`,
            stochasticity: config.stochasticity ?? 0.35,
        };
        const currentResult = await generateScheduleWithHeuristics(data, currentConfig);
        const currentScore = currentResult.score ?? calculateScheduleScore(data, currentResult, currentConfig);
        
        if (currentScore.total < lowestScore) {
            lowestScore = currentScore.total;
            bestResult = { ...currentResult, score: currentScore };
            console.log(`New best result found at iteration ${i}: score=${currentScore.total.toFixed(2)}, unscheduled=${currentScore.unscheduled}, hard=${currentScore.hardViolations}.`);
        }
    }

    // Fallback in case no iterations produced a valid result (highly unlikely)
    if (!bestResult) {
    return { schedule: [], unschedulable: [], explanations: {} };
    }

    return bestResult;
};
