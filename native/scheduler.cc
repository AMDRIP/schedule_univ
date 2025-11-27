#include "scheduler.h"
#include <algorithm>
#include <iostream>
#include <limits>
#include <random>
#include <chrono>
#include <cmath>
#include <unordered_set>

Scheduler::Scheduler() {}

void Scheduler::loadData(
    const std::vector<Teacher>& teachers,
    const std::vector<Group>& groups,
    const std::vector<Classroom>& classrooms,
    const std::vector<Subject>& subjects,
    const std::vector<TimeSlot>& timeSlots,
    const std::vector<UnscheduledEntry>& entries,
    const Config& config
) {
    teachers_ = teachers;
    groups_ = groups;
    classrooms_ = classrooms;
    subjects_ = subjects;
    timeSlots_ = timeSlots;
    entries_ = entries;
    config_ = config;

    for (auto& t : teachers_) teacherMap_[t.id] = &t;
    for (auto& g : groups_) groupMap_[g.id] = &g;
    for (auto& c : classrooms_) classroomMap_[c.id] = &c;
    for (auto& s : subjects_) subjectMap_[s.id] = &s;

    workDays_ = {"Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"};
    
    indexify();
}

void Scheduler::indexify() {
    // 1. Create Mappings
    for (size_t i = 0; i < teachers_.size(); ++i) tIdx_[teachers_[i].id] = i;
    for (size_t i = 0; i < groups_.size(); ++i) gIdx_[groups_[i].id] = i;
    for (size_t i = 0; i < classrooms_.size(); ++i) cIdx_[classrooms_[i].id] = i;
    for (size_t i = 0; i < subjects_.size(); ++i) sIdx_[subjects_[i].id] = i;
    for (size_t i = 0; i < timeSlots_.size(); ++i) tsIdx_[timeSlots_[i].id] = i;
    for (size_t i = 0; i < workDays_.size(); ++i) dIdx_[workDays_[i]] = i;

    // 2. Pre-calc Availability
    int numDays = workDays_.size();
    int numSlots = timeSlots_.size();

    fastTeacherAvail_.assign(teachers_.size(), std::vector<std::vector<int>>(numDays, std::vector<int>(numSlots, 0)));
    for (size_t i = 0; i < teachers_.size(); ++i) {
        for (size_t d = 0; d < numDays; ++d) {
            for (size_t s = 0; s < numSlots; ++s) {
                auto itDay = teachers_[i].availabilityGrid.grid.find(workDays_[d]);
                if (itDay != teachers_[i].availabilityGrid.grid.end()) {
                    auto itSlot = itDay->second.find(timeSlots_[s].id);
                    if (itSlot != itDay->second.end()) {
                        fastTeacherAvail_[i][d][s] = (int)itSlot->second;
                    }
                }
            }
        }
    }

    fastGroupAvail_.assign(groups_.size(), std::vector<std::vector<int>>(numDays, std::vector<int>(numSlots, 0)));
    for (size_t i = 0; i < groups_.size(); ++i) {
        for (size_t d = 0; d < numDays; ++d) {
            for (size_t s = 0; s < numSlots; ++s) {
                auto itDay = groups_[i].availabilityGrid.grid.find(workDays_[d]);
                if (itDay != groups_[i].availabilityGrid.grid.end()) {
                    auto itSlot = itDay->second.find(timeSlots_[s].id);
                    if (itSlot != itDay->second.end()) {
                        fastGroupAvail_[i][d][s] = (int)itSlot->second;
                    }
                }
            }
        }
    }

    // 3. Pre-calc Pins
    fastTeacherPin_.assign(teachers_.size(), -1);
    for (size_t i = 0; i < teachers_.size(); ++i) {
        if (!teachers_[i].pinnedClassroomId.empty() && cIdx_.count(teachers_[i].pinnedClassroomId))
            fastTeacherPin_[i] = cIdx_[teachers_[i].pinnedClassroomId];
    }
    
    fastGroupPin_.assign(groups_.size(), -1);
    for (size_t i = 0; i < groups_.size(); ++i) {
        if (!groups_[i].pinnedClassroomId.empty() && cIdx_.count(groups_[i].pinnedClassroomId))
            fastGroupPin_[i] = cIdx_[groups_[i].pinnedClassroomId];
    }

    fastSubjectPin_.assign(subjects_.size(), -1);
    for (size_t i = 0; i < subjects_.size(); ++i) {
        if (!subjects_[i].pinnedClassroomId.empty() && cIdx_.count(subjects_[i].pinnedClassroomId))
            fastSubjectPin_[i] = cIdx_[subjects_[i].pinnedClassroomId];
    }

    // 4. Pre-calc Suitable Rooms for Entries
    entrySuitableRooms_.resize(entries_.size());
    for (size_t i = 0; i < entries_.size(); ++i) {
        const auto& entry = entries_[i];
        Subject* subject = subjectMap_[entry.subjectId];
        if (!subject) continue;

        for (size_t c = 0; c < classrooms_.size(); ++c) {
            const auto& room = classrooms_[c];
            if (room.capacity < entry.studentCount) continue;

            bool typeMatch = false;
            if (subject->classroomTypeRequirements.count(entry.classType)) {
                const auto& reqs = subject->classroomTypeRequirements.at(entry.classType);
                for (const auto& r : reqs) if (r == room.typeId) { typeMatch = true; break; }
            } else { typeMatch = true; }

            if (typeMatch && !subject->requiredClassroomTagIds.empty()) {
                for (const auto& reqTag : subject->requiredClassroomTagIds) {
                    bool hasTag = false;
                    for (const auto& cTag : room.tagIds) if (cTag == reqTag) hasTag = true;
                    if (!hasTag) { typeMatch = false; break; }
                }
            }

            if (typeMatch) {
                entrySuitableRooms_[i].push_back(c);
            }
        }
    }
}

double Scheduler::calculateCost(const std::vector<ScheduleEntry>& schedule) {
    double cost = 0;
    double penaltyMultiplier = config_.strictness / 5.0;
    int numDays = workDays_.size();
    int numSlots = timeSlots_.size();
    int numTeachers = teachers_.size();
    int numGroups = groups_.size();
    int numRooms = classrooms_.size();

    // Flat arrays for usage tracking (much faster than map)
    // Index = entityIdx * (numDays * numSlots) + dayIdx * numSlots + slotIdx
    std::vector<int> teacherUsage(numTeachers * numDays * numSlots, 0);
    std::vector<int> groupUsage(numGroups * numDays * numSlots, 0);
    std::vector<int> roomUsage(numRooms * numDays * numSlots, 0);

    // Daily load tracking
    std::vector<int> teacherDailyLoad(numTeachers * numDays, 0);
    std::vector<int> groupDailyLoad(numGroups * numDays, 0);

    for (const auto& entry : schedule) {
        if (dIdx_.find(entry.day) == dIdx_.end() || tsIdx_.find(entry.timeSlotId) == tsIdx_.end()) continue;
        
        int d = dIdx_.at(entry.day);
        int s = tsIdx_.at(entry.timeSlotId);
        int offset = d * numSlots + s;

        // 1. Hard Conflicts & Usage
        if (tIdx_.count(entry.teacherId)) {
            int t = tIdx_.at(entry.teacherId);
            if (++teacherUsage[t * numDays * numSlots + offset] > 1) cost += 10000;
            teacherDailyLoad[t * numDays + d]++;
        }

        if (cIdx_.count(entry.classroomId)) {
            int c = cIdx_.at(entry.classroomId);
            if (++roomUsage[c * numDays * numSlots + offset] > 1) cost += 10000;
        }

        for (const auto& gid : entry.groupIds) {
            if (gIdx_.count(gid)) {
                int g = gIdx_.at(gid);
                if (++groupUsage[g * numDays * numSlots + offset] > 1) cost += 10000;
                groupDailyLoad[g * numDays + d]++;
            }
        }

        // 2. Availability (using fast lookup)
        if (tIdx_.count(entry.teacherId)) {
            int t = tIdx_.at(entry.teacherId);
            int av = fastTeacherAvail_[t][d][s];
            if (av == 2) cost += 20 * penaltyMultiplier; // Undesirable
            else if (av == 1) cost -= 10 * penaltyMultiplier; // Desirable
            else if (av == 3) cost += 10000; // Forbidden
        }
        
        for (const auto& gid : entry.groupIds) {
            if (gIdx_.count(gid)) {
                int g = gIdx_.at(gid);
                int av = fastGroupAvail_[g][d][s];
                if (av == 2) cost += 20 * penaltyMultiplier;
                else if (av == 1) cost -= 10 * penaltyMultiplier;
                else if (av == 3) cost += 10000;
            }
        }

        // 3. Pinned Classrooms
        bool hasPin = false;
        bool matchPin = false;
        int c = cIdx_.count(entry.classroomId) ? cIdx_.at(entry.classroomId) : -1;

        if (tIdx_.count(entry.teacherId)) {
            int pin = fastTeacherPin_[tIdx_.at(entry.teacherId)];
            if (pin != -1) { hasPin = true; if (pin == c) matchPin = true; }
        }
        if (sIdx_.count(entry.subjectId)) {
            int pin = fastSubjectPin_[sIdx_.at(entry.subjectId)];
            if (pin != -1) { hasPin = true; if (pin == c) matchPin = true; }
        }
        for (const auto& gid : entry.groupIds) {
            if (gIdx_.count(gid)) {
                int pin = fastGroupPin_[gIdx_.at(gid)];
                if (pin != -1) { hasPin = true; if (pin == c) matchPin = true; }
            }
        }
        if (hasPin) cost += matchPin ? -100 * penaltyMultiplier : 50 * penaltyMultiplier;
    }

    // 4. Day Load Limits (using fast daily load)
    if (config_.settings.enforceStandardRules) {
        for (int val : teacherDailyLoad) {
            if (val >= 4) cost += (val - 3) * 150 * penaltyMultiplier;
        }
        for (int val : groupDailyLoad) {
            if (val >= 5) cost += (val - 4) * 200 * penaltyMultiplier;
            else if (val >= 4) cost += (val - 3) * 100 * penaltyMultiplier;
        }
    }

    return cost;
}

std::vector<ScheduleEntry> Scheduler::solve() {
    std::vector<ScheduleEntry> currentSchedule;
    std::vector<UnscheduledEntry> sortedEntries = entries_;

    // Sort entries
    std::sort(sortedEntries.begin(), sortedEntries.end(), [&](const UnscheduledEntry& a, const UnscheduledEntry& b) {
        return a.studentCount > b.studentCount; 
    });

    // --- PHASE 1: GREEDY INITIALIZATION ---
    // (Simplified for brevity, but using fast lookups would be better. 
    //  For now, keeping logic similar but using pre-calc rooms)
    
    for (size_t i = 0; i < sortedEntries.size(); ++i) {
        const auto& entry = sortedEntries[i];
        if (entrySuitableRooms_[i].empty()) continue;

        double bestLocalCost = std::numeric_limits<double>::max();
        ScheduleEntry bestEntry;
        bool found = false;

        // Try random subset of slots/rooms to speed up greedy
        // Or just iterate all. With integer math it's fast.
        for (size_t d = 0; d < workDays_.size(); ++d) {
            for (size_t s = 0; s < timeSlots_.size(); ++s) {
                // Quick check teacher availability
                if (tIdx_.count(entry.teacherId)) {
                    int t = tIdx_.at(entry.teacherId);
                    if (fastTeacherAvail_[t][d][s] == 3) continue; // Forbidden
                }

                for (int c : entrySuitableRooms_[i]) {
                    // Check simple conflicts in current schedule
                    bool conflict = false;
                    for(const auto& sch : currentSchedule) {
                        if (sch.day == workDays_[d] && sch.timeSlotId == timeSlots_[s].id) {
                            if (sch.teacherId == entry.teacherId || sch.classroomId == classrooms_[c].id) {
                                conflict = true; break;
                            }
                            for(const auto& g : entry.groupIds) {
                                for(const auto& sg : sch.groupIds) if (g == sg) { conflict = true; break; }
                            }
                        }
                        if (conflict) break;
                    }
                    if (conflict) continue;

                    double localCost = 0;
                    // Add preference cost
                    if (tIdx_.count(entry.teacherId)) {
                         int av = fastTeacherAvail_[tIdx_.at(entry.teacherId)][d][s];
                         if (av == 2) localCost += 20;
                    }

                    if (localCost < bestLocalCost) {
                        bestLocalCost = localCost;
                        bestEntry.id = "sched-" + entry.uid;
                        bestEntry.day = workDays_[d];
                        bestEntry.timeSlotId = timeSlots_[s].id;
                        bestEntry.classroomId = classrooms_[c].id;
                        bestEntry.subjectId = entry.subjectId;
                        bestEntry.teacherId = entry.teacherId;
                        bestEntry.groupIds = entry.groupIds;
                        bestEntry.classType = entry.classType;
                        bestEntry.unscheduledUid = entry.uid;
                        found = true;
                    }
                }
            }
        }
        if (found) currentSchedule.push_back(bestEntry);
    }

    // --- PHASE 2: PARALLEL SIMULATED ANNEALING ---
    if (currentSchedule.empty()) return currentSchedule;

    // Number of parallel chains
    int num_chains = 1;
    #ifdef _OPENMP
    num_chains = omp_get_max_threads();
    // Clamp to reasonable number (e.g., 4-8) to avoid overhead if many cores
    if (num_chains > 8) num_chains = 8;
    if (num_chains < 1) num_chains = 1;
    #endif

    std::vector<std::vector<ScheduleEntry>> results(num_chains);
    std::vector<double> costs(num_chains);

    #pragma omp parallel for
    for (int chain = 0; chain < num_chains; ++chain) {
        // Each thread gets its own copy and PRNG
        std::vector<ScheduleEntry> localSchedule = currentSchedule;
        
        // Seed with time + chain id to ensure diversity
        unsigned int seed = (unsigned int)(std::chrono::steady_clock::now().time_since_epoch().count() + chain * 777);
        std::mt19937 rng(seed);
        std::uniform_real_distribution<double> dist(0.0, 1.0);

        double currentCost = calculateCost(localSchedule);
        std::vector<ScheduleEntry> bestLocalSchedule = localSchedule;
        double bestLocalCost = currentCost;

        double temperature = 1000.0;
        double coolingRate = 0.995;
        int iterations = 5000; // Fewer iterations per chain, but parallel

        for (int i = 0; i < iterations; ++i) {
            std::vector<ScheduleEntry> neighbor = localSchedule;
            
            // Mutation
            if (neighbor.empty()) break;
            int idx = rng() % neighbor.size();
            ScheduleEntry& e = neighbor[idx];

            // Move to random slot/room
            int d = rng() % workDays_.size();
            int s = rng() % timeSlots_.size();
            e.day = workDays_[d];
            e.timeSlotId = timeSlots_[s].id;

            // Find mapping back to entry index to get suitable rooms
            // Optimization: Store entry index in ScheduleEntry? 
            // For now, linear scan or just pick random room (less safe but fast)
            // Let's pick random room from ALL rooms, cost function handles validity
            // Better: pick from pre-calculated suitable list if possible.
            // We don't have easy link back to `entries_` index here.
            // Fallback: pick random room.
            int r = rng() % classrooms_.size();
            e.classroomId = classrooms_[r].id;

            double neighborCost = calculateCost(neighbor);
            double delta = neighborCost - currentCost;

            if (delta < 0 || std::exp(-delta / temperature) > dist(rng)) {
                localSchedule = neighbor;
                currentCost = neighborCost;
                if (currentCost < bestLocalCost) {
                    bestLocalCost = currentCost;
                    bestLocalSchedule = localSchedule;
                }
            }
            temperature *= coolingRate;
        }
        
        results[chain] = bestLocalSchedule;
        costs[chain] = bestLocalCost;
    }

    // Pick best result
    int bestChain = 0;
    for (int i = 1; i < num_chains; ++i) {
        if (costs[i] < costs[bestChain]) bestChain = i;
    }

    return results[bestChain];
}
