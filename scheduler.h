#ifndef SCHEDULER_H
#define SCHEDULER_H

#include <vector>
#include <string>
#include <map>
#include <set>
#include <unordered_map>
#include <unordered_set>
#ifdef _OPENMP
#include <omp.h>
#endif

enum class AvailabilityType {
    Available = 0,
    Desirable = 1,
    Undesirable = 2,
    Forbidden = 3
};

struct AvailabilityGrid {
    // day -> timeSlotId -> type
    std::unordered_map<std::string, std::unordered_map<std::string, AvailabilityType>> grid;
};

enum class RuleSeverity { Strict, Strong, Medium, Weak };
enum class RuleAction { AvoidTime, PreferTime, MaxPerDay, MinPerDay, AvoidRoom, PreferRoom };

struct RuleCondition {
    std::string entityType; // "teacher", "group", "subject", "classType"
    std::vector<std::string> entityIds;
    std::string classType; // optional
};

struct SchedulingRule {
    std::string id;
    std::vector<RuleCondition> conditions;
    RuleAction action;
    RuleSeverity severity;
    std::string day; // optional
    std::string timeSlotId; // optional
    int param; // optional (for MaxPerDay etc)
};

struct Teacher {
    std::string id;
    std::string name;
    AvailabilityGrid availabilityGrid;
    std::string pinnedClassroomId;
};

struct Group {
    std::string id;
    std::string name;
    int studentCount;
    int course;
    AvailabilityGrid availabilityGrid;
    std::string pinnedClassroomId;
};

struct Classroom {
    std::string id;
    std::string name;
    int capacity;
    std::string typeId;
    std::vector<std::string> tagIds;
};

struct Subject {
    std::string id;
    std::string name;
    std::unordered_map<std::string, std::vector<std::string>> classroomTypeRequirements; // classType -> [roomTypeIds]
    std::vector<std::string> requiredClassroomTagIds;
    std::string pinnedClassroomId;
};

struct TimeSlot {
    std::string id;
    std::string name;
    int order;
};

struct UnscheduledEntry {
    std::string uid;
    std::string subjectId;
    std::vector<std::string> groupIds;
    std::string teacherId;
    std::string classType;
    int studentCount;
    // ... other fields if needed
};

struct ScheduleEntry {
    std::string id;
    std::string day;
    std::string timeSlotId;
    std::string classroomId;
    std::string subjectId;
    std::string teacherId;
    std::vector<std::string> groupIds;
    std::string classType;
    std::string unscheduledUid;
};

struct Settings {
    bool allowWindows;
    bool enforceStandardRules;
    bool respectProductionCalendar;
    bool useShortenedPreHolidaySchedule;
};

struct Config {
    int strictness;
    Settings settings;
    std::vector<SchedulingRule> schedulingRules;
};

class Scheduler {
public:
    Scheduler();
    void loadData(
        const std::vector<Teacher>& teachers,
        const std::vector<Group>& groups,
        const std::vector<Classroom>& classrooms,
        const std::vector<Subject>& subjects,
        const std::vector<TimeSlot>& timeSlots,
        const std::vector<UnscheduledEntry>& entries,
        const Config& config
    );
    std::vector<ScheduleEntry> solve();

private:
    std::vector<Teacher> teachers_;
    std::vector<Group> groups_;
    std::vector<Classroom> classrooms_;
    std::vector<Subject> subjects_;
    std::vector<TimeSlot> timeSlots_;
    std::vector<UnscheduledEntry> entries_;
    Config config_;

    std::unordered_map<std::string, Teacher*> teacherMap_;
    std::unordered_map<std::string, Group*> groupMap_;
    std::unordered_map<std::string, Classroom*> classroomMap_;
    std::unordered_map<std::string, Subject*> subjectMap_;
    std::vector<std::string> workDays_;

    // --- Optimization: Integer Mappings ---
    std::map<std::string, int> tIdx_;
    std::map<std::string, int> gIdx_;
    std::map<std::string, int> cIdx_;
    std::map<std::string, int> sIdx_; // subject
    std::map<std::string, int> tsIdx_; // timeSlot
    std::map<std::string, int> dIdx_; // day

    // Fast Lookups (Vectors of Vectors)
    // [teacherIdx][dayIdx][slotIdx] -> AvailabilityType
    std::vector<std::vector<std::vector<int>>> fastTeacherAvail_;
    // [groupIdx][dayIdx][slotIdx] -> AvailabilityType
    std::vector<std::vector<std::vector<int>>> fastGroupAvail_;
    
    // Pinned rooms: [entityIdx] -> classroomIdx (or -1)
    std::vector<int> fastTeacherPin_;
    std::vector<int> fastGroupPin_;
    std::vector<int> fastSubjectPin_;

    // Pre-calculated suitable classrooms for each subject entry
    // [entryIdx] -> vector of classroomIndices
    std::vector<std::vector<int>> entrySuitableRooms_;

    void indexify();
    double calculateCost(const std::vector<ScheduleEntry>& schedule);
    // double calculateEntryCost(const ScheduleEntry& entry, const std::vector<ScheduleEntry>& currentSchedule); // Removed unused
};

#endif // SCHEDULER_H
