#include <napi.h>
#include "scheduler.h"

// Helper to get string property
std::string GetString(const Napi::Object& obj, const char* key) {
    if (obj.Has(key) && obj.Get(key).IsString()) {
        return obj.Get(key).As<Napi::String>().Utf8Value();
    }
    return "";
}

// Helper to get int property
int GetInt(const Napi::Object& obj, const char* key) {
    if (obj.Has(key) && obj.Get(key).IsNumber()) {
        return obj.Get(key).As<Napi::Number>().Int32Value();
    }
    return 0;
}

// Helper to get boolean property
bool GetBool(const Napi::Object& obj, const char* key) {
    if (obj.Has(key) && obj.Get(key).IsBoolean()) {
        return obj.Get(key).As<Napi::Boolean>().Value();
    }
    return false;
}

// Helper to get array of strings
std::vector<std::string> GetStringArray(const Napi::Object& obj, const char* key) {
    std::vector<std::string> result;
    if (obj.Has(key) && obj.Get(key).IsArray()) {
        Napi::Array arr = obj.Get(key).As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            Napi::Value val = arr[i];
            if (val.IsString()) {
                result.push_back(val.As<Napi::String>().Utf8Value());
            }
        }
    }
    return result;
}

// Helper to parse AvailabilityGrid
AvailabilityGrid GetAvailabilityGrid(const Napi::Object& obj, const char* key) {
    AvailabilityGrid grid;
    if (obj.Has(key) && obj.Get(key).IsObject()) {
        Napi::Object gridObj = obj.Get(key).As<Napi::Object>();
        Napi::Array days = gridObj.GetPropertyNames();
        for (uint32_t i = 0; i < days.Length(); i++) {
            std::string day = days.Get(i).As<Napi::String>().Utf8Value();
            Napi::Object dayObj = gridObj.Get(day).As<Napi::Object>();
            Napi::Array slots = dayObj.GetPropertyNames();
            for (uint32_t j = 0; j < slots.Length(); j++) {
                std::string slot = slots.Get(j).As<Napi::String>().Utf8Value();
                int type = dayObj.Get(slot).As<Napi::Number>().Int32Value();
                grid.grid[day][slot] = static_cast<AvailabilityType>(type);
            }
        }
    }
    return grid;
}

Napi::Value RunScheduler(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected configuration object").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object input = info[0].As<Napi::Object>();

    // Parse Teachers
    std::vector<Teacher> teachers;
    if (input.Has("teachers") && input.Get("teachers").IsArray()) {
        Napi::Array arr = input.Get("teachers").As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            Napi::Object obj = arr.Get(i).As<Napi::Object>();
            Teacher t;
            t.id = GetString(obj, "id");
            t.name = GetString(obj, "name");
            t.pinnedClassroomId = GetString(obj, "pinnedClassroomId");
            t.availabilityGrid = GetAvailabilityGrid(obj, "availabilityGrid");
            teachers.push_back(t);
        }
    }

    // Parse Groups
    std::vector<Group> groups;
    if (input.Has("groups") && input.Get("groups").IsArray()) {
        Napi::Array arr = input.Get("groups").As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            Napi::Object obj = arr.Get(i).As<Napi::Object>();
            Group g;
            g.id = GetString(obj, "id");
            g.name = GetString(obj, "name");
            g.studentCount = GetInt(obj, "studentCount");
            g.course = GetInt(obj, "course");
            g.pinnedClassroomId = GetString(obj, "pinnedClassroomId");
            g.availabilityGrid = GetAvailabilityGrid(obj, "availabilityGrid");
            groups.push_back(g);
        }
    }

    // Parse Classrooms
    std::vector<Classroom> classrooms;
    if (input.Has("classrooms") && input.Get("classrooms").IsArray()) {
        Napi::Array arr = input.Get("classrooms").As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            Napi::Object obj = arr.Get(i).As<Napi::Object>();
            Classroom c;
            c.id = GetString(obj, "id");
            c.name = GetString(obj, "name");
            c.capacity = GetInt(obj, "capacity");
            c.typeId = GetString(obj, "typeId");
            c.tagIds = GetStringArray(obj, "tagIds");
            classrooms.push_back(c);
        }
    }

    // Parse Subjects
    std::vector<Subject> subjects;
    if (input.Has("subjects") && input.Get("subjects").IsArray()) {
        Napi::Array arr = input.Get("subjects").As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            Napi::Object obj = arr.Get(i).As<Napi::Object>();
            Subject s;
            s.id = GetString(obj, "id");
            s.name = GetString(obj, "name");
            s.pinnedClassroomId = GetString(obj, "pinnedClassroomId");
            s.requiredClassroomTagIds = GetStringArray(obj, "requiredClassroomTagIds");
            
            if (obj.Has("classroomTypeRequirements") && obj.Get("classroomTypeRequirements").IsObject()) {
                Napi::Object reqs = obj.Get("classroomTypeRequirements").As<Napi::Object>();
                Napi::Array keys = reqs.GetPropertyNames();
                for (uint32_t k = 0; k < keys.Length(); k++) {
                    std::string classType = keys.Get(k).As<Napi::String>().Utf8Value();
                    s.classroomTypeRequirements[classType] = GetStringArray(reqs, classType.c_str());
                }
            }
            subjects.push_back(s);
        }
    }

    // Parse TimeSlots
    std::vector<TimeSlot> timeSlots;
    if (input.Has("timeSlots") && input.Get("timeSlots").IsArray()) {
        Napi::Array arr = input.Get("timeSlots").As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            Napi::Object obj = arr.Get(i).As<Napi::Object>();
            TimeSlot ts;
            ts.id = GetString(obj, "id");
            ts.name = GetString(obj, "name");
            ts.order = GetInt(obj, "order");
            timeSlots.push_back(ts);
        }
    }

    // Parse UnscheduledEntries
    std::vector<UnscheduledEntry> entries;
    if (input.Has("entries") && input.Get("entries").IsArray()) {
        Napi::Array arr = input.Get("entries").As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            Napi::Object obj = arr.Get(i).As<Napi::Object>();
            UnscheduledEntry e;
            e.uid = GetString(obj, "uid");
            e.subjectId = GetString(obj, "subjectId");
            e.teacherId = GetString(obj, "teacherId");
            e.classType = GetString(obj, "classType");
            e.studentCount = GetInt(obj, "studentCount");
            e.groupIds = GetStringArray(obj, "groupIds");
            if (e.groupIds.empty() && obj.Has("groupId")) {
                e.groupIds.push_back(GetString(obj, "groupId"));
            }
            entries.push_back(e);
        }
    }

    // Parse Config
    Config config;
    if (input.Has("config") && input.Get("config").IsObject()) {
        Napi::Object confObj = input.Get("config").As<Napi::Object>();
        config.strictness = GetInt(confObj, "strictness");
        
        if (confObj.Has("settings") && confObj.Get("settings").IsObject()) {
            Napi::Object setObj = confObj.Get("settings").As<Napi::Object>();
            config.settings.allowWindows = GetBool(setObj, "allowWindows");
            config.settings.enforceStandardRules = GetBool(setObj, "enforceStandardRules");
            config.settings.respectProductionCalendar = GetBool(setObj, "respectProductionCalendar");
            config.settings.useShortenedPreHolidaySchedule = GetBool(setObj, "useShortenedPreHolidaySchedule");
        }

        if (confObj.Has("schedulingRules") && confObj.Get("schedulingRules").IsArray()) {
            Napi::Array rulesArr = confObj.Get("schedulingRules").As<Napi::Array>();
            for (uint32_t i = 0; i < rulesArr.Length(); i++) {
                Napi::Object ruleObj = rulesArr.Get(i).As<Napi::Object>();
                SchedulingRule rule;
                rule.id = GetString(ruleObj, "id");
                rule.action = static_cast<RuleAction>(GetInt(ruleObj, "action")); // Assuming enum maps to int
                rule.severity = static_cast<RuleSeverity>(GetInt(ruleObj, "severity"));
                rule.day = GetString(ruleObj, "day");
                rule.timeSlotId = GetString(ruleObj, "timeSlotId");
                rule.param = GetInt(ruleObj, "param");

                if (ruleObj.Has("conditions") && ruleObj.Get("conditions").IsArray()) {
                    Napi::Array condArr = ruleObj.Get("conditions").As<Napi::Array>();
                    for (uint32_t j = 0; j < condArr.Length(); j++) {
                        Napi::Object condObj = condArr.Get(j).As<Napi::Object>();
                        RuleCondition cond;
                        cond.entityType = GetString(condObj, "entityType");
                        cond.entityIds = GetStringArray(condObj, "entityIds");
                        cond.classType = GetString(condObj, "classType");
                        rule.conditions.push_back(cond);
                    }
                }
                config.schedulingRules.push_back(rule);
            }
        }
    }

    Scheduler scheduler;
    scheduler.loadData(teachers, groups, classrooms, subjects, timeSlots, entries, config);
    std::vector<ScheduleEntry> result = scheduler.solve();

    // Convert result back to JS
    Napi::Array output = Napi::Array::New(env, result.size());
    for (size_t i = 0; i < result.size(); i++) {
        Napi::Object item = Napi::Object::New(env);
        item.Set("id", result[i].id);
        item.Set("day", result[i].day);
        item.Set("timeSlotId", result[i].timeSlotId);
        item.Set("classroomId", result[i].classroomId);
        item.Set("subjectId", result[i].subjectId);
        item.Set("teacherId", result[i].teacherId);
        item.Set("classType", result[i].classType);
        item.Set("unscheduledUid", result[i].unscheduledUid);
        
        Napi::Array groupIds = Napi::Array::New(env, result[i].groupIds.size());
        for (size_t j = 0; j < result[i].groupIds.size(); j++) {
            groupIds[j] = Napi::String::New(env, result[i].groupIds[j]);
        }
        item.Set("groupIds", groupIds);

        output[i] = item;
    }

    return output;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "runScheduler"), Napi::Function::New(env, RunScheduler));
    return exports;
}

NODE_API_MODULE(scheduler_native, Init)
