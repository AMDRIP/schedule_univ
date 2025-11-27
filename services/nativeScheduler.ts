import {
    ScheduleEntry, Teacher, Group, Classroom, Subject, TimeSlot, UnscheduledEntry, HeuristicConfig
} from '../types';

// Try to load the native module
let nativeScheduler: any = null;
try {
    // We use 'require' dynamically to avoid bundling issues if the module isn't built
    const bindings = require('bindings');
    nativeScheduler = bindings('scheduler_native');
} catch (e) {
    console.warn("Native scheduler module not found or failed to load. Falling back to JS implementation.", e);
}

export const isNativeSchedulerAvailable = () => {
    return !!nativeScheduler;
};

export const generateScheduleWithNative = async (
    teachers: Teacher[],
    groups: Group[],
    classrooms: Classroom[],
    subjects: Subject[],
    timeSlots: TimeSlot[],
    entries: UnscheduledEntry[],
    config: HeuristicConfig
): Promise<ScheduleEntry[]> => {
    if (!nativeScheduler) {
        throw new Error("Native scheduler is not available.");
    }

    console.log("Starting native scheduler...");
    const start = performance.now();

    // Prepare data for C++
    // We pass only the necessary fields to minimize overhead
    const input = {
        teachers: teachers.map(t => ({ id: t.id })),
        groups: groups.map(g => ({ id: g.id, studentCount: g.studentCount })),
        classrooms: classrooms.map(c => ({
            id: c.id,
            capacity: c.capacity,
            typeId: c.typeId,
            tagIds: c.tagIds || []
        })),
        subjects: subjects.map(s => ({
            id: s.id,
            classroomTypeRequirements: s.classroomTypeRequirements || {}
        })),
        timeSlots: timeSlots.map(ts => ({ id: ts.id, time: ts.time })),
        entries: entries.map(e => ({
            uid: e.uid,
            subjectId: e.subjectId,
            teacherId: e.teacherId,
            classType: e.classType,
            studentCount: e.studentCount,
            groupIds: e.groupIds || (e.groupId ? [e.groupId] : []),
            groupId: e.groupId // Fallback
        })),
        config: {
            strictness: config.strictness
        }
    };

    const result = nativeScheduler.runScheduler(input);

    const end = performance.now();
    console.log(`Native scheduler finished in ${(end - start).toFixed(2)}ms. Generated ${result.length} entries.`);

    return result as ScheduleEntry[];
};
