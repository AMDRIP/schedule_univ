import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { BellScheduleProfile, BellScheduleProfileType, FormOfStudy, TimeSlot, TimeSlotShift } from '../types';
import { AlertIcon, CheckCircleIcon, ClockIcon, EditIcon, PlusIcon, TrashIcon } from './icons';

type TabId = 'overview' | 'normal' | 'shortened' | 'profiles' | 'calendar' | 'quality';
type BuiltInProfileId = 'normal' | 'shortened';

const SHIFT_LABELS: Record<TimeSlotShift, string> = {
  first: 'Первая смена',
  second: 'Вторая смена',
};

const PROFILE_TYPE_LABELS: Record<BellScheduleProfileType, string> = {
  normal: 'Обычный день',
  shortened: 'Сокращённый день',
  session: 'Сессия',
  saturday: 'Суббота',
  practice: 'Практика',
  exam: 'Экзамены',
  custom: 'Особый режим',
};

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const createSlot = (order: number, shift: TimeSlotShift, prefix = 'ts'): Omit<TimeSlot, 'id'> => ({
  time: '00:00-00:00',
  shift,
  order,
  name: `${order} пара`,
  breakMinutesAfter: 15,
  kind: 'lesson',
  color: shift === 'first' ? 'blue' : 'indigo',
  notes: '',
});

const emptyProfileDraft = (): Omit<BellScheduleProfile, 'id'> => ({
  name: '',
  type: 'custom',
  description: '',
  slots: [],
  appliesToDates: [],
  appliesToWeekdays: [],
  formOfStudyIds: [],
  buildingPlanIds: [],
  isActive: true,
});

const parseSlotTime = (time: string) => {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const [, sh, sm, eh, em] = match.map(Number);
  return { start: sh * 60 + sm, end: eh * 60 + em };
};

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
};

const slotDuration = (slot: TimeSlot) => {
  const parsed = parseSlotTime(slot.time);
  return parsed ? parsed.end - parsed.start : 0;
};

const sortSlots = (slots: TimeSlot[]) => [...slots].sort((a, b) => {
  const aTime = parseSlotTime(a.time)?.start ?? 0;
  const bTime = parseSlotTime(b.time)?.start ?? 0;
  return aTime - bTime || (a.order || 0) - (b.order || 0);
});

const BellScheduleManager: React.FC = () => {
  const {
    timeSlots,
    timeSlotsShortened,
    bellScheduleProfiles,
    settings,
    productionCalendar,
    buildingPlans,
    schedule,
    addItem,
    updateItem,
    deleteItem,
  } = useStore();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedBuiltIn, setSelectedBuiltIn] = useState<BuiltInProfileId>('normal');
  const [selectedProfileId, setSelectedProfileId] = useState(bellScheduleProfiles[0]?.id || '');
  const [profileDraft, setProfileDraft] = useState<Omit<BellScheduleProfile, 'id'> | BellScheduleProfile>(emptyProfileDraft());
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [compressMinutes, setCompressMinutes] = useState(10);
  const [secondShiftOffset, setSecondShiftOffset] = useState(15);
  const [dateInput, setDateInput] = useState('');

  const currentBuiltIn = activeTab === 'shortened' ? 'shortened' : selectedBuiltIn;
  const activeBuiltInSlots = currentBuiltIn === 'normal' ? timeSlots : timeSlotsShortened;
  const activeBuiltInDataType = currentBuiltIn === 'normal' ? 'timeSlots' : 'timeSlotsShortened';

  const builtInProfiles = [
    { id: 'normal' as const, name: 'Обычный день', type: 'normal' as BellScheduleProfileType, slots: timeSlots },
    { id: 'shortened' as const, name: 'Сокращённый день', type: 'shortened' as BellScheduleProfileType, slots: timeSlotsShortened },
  ];

  const allProfiles = [
    ...builtInProfiles.map(profile => ({ ...profile, builtIn: true })),
    ...bellScheduleProfiles.map(profile => ({ ...profile, builtIn: false })),
  ];

  const totalSlots = timeSlots.length + timeSlotsShortened.length + bellScheduleProfiles.reduce((sum, profile) => sum + profile.slots.length, 0);
  const firstShiftSlots = [...timeSlots, ...timeSlotsShortened, ...bellScheduleProfiles.flatMap(profile => profile.slots)].filter(slot => slot.shift === 'first').length;
  const secondShiftSlots = [...timeSlots, ...timeSlotsShortened, ...bellScheduleProfiles.flatMap(profile => profile.slots)].filter(slot => slot.shift === 'second').length;

  const qualityIssues = useMemo(() => {
    const issues: { title: string; detail: string; severity: 'critical' | 'warning' | 'info'; profileId?: string; builtIn?: BuiltInProfileId }[] = [];

    const checkProfile = (name: string, slots: TimeSlot[], profileId?: string, builtIn?: BuiltInProfileId) => {
      if (slots.length === 0) {
        issues.push({ title: 'Пустая сетка', detail: `${name}: нет слотов звонков.`, severity: 'critical', profileId, builtIn });
        return;
      }
      const sorted = sortSlots(slots);
      const shifts = new Set(sorted.map(slot => slot.shift));
      if (!shifts.has('first')) {
        issues.push({ title: 'Нет первой смены', detail: `${name}: отсутствуют слоты первой смены.`, severity: 'warning', profileId, builtIn });
      }
      if (!shifts.has('second')) {
        issues.push({ title: 'Нет второй смены', detail: `${name}: отсутствуют слоты второй смены.`, severity: 'info', profileId, builtIn });
      }
      sorted.forEach((slot, index) => {
        const parsed = parseSlotTime(slot.time);
        if (!parsed) {
          issues.push({ title: 'Неверный формат времени', detail: `${name}: слот "${slot.time}" должен быть в формате 08:30-10:00.`, severity: 'critical', profileId, builtIn });
          return;
        }
        if (parsed.end <= parsed.start) {
          issues.push({ title: 'Неверная длительность', detail: `${name}: слот "${slot.time}" заканчивается раньше начала.`, severity: 'critical', profileId, builtIn });
        }
        if (slotDuration(slot) < 30) {
          issues.push({ title: 'Слишком короткий слот', detail: `${name}: "${slot.time}" короче 30 минут.`, severity: 'warning', profileId, builtIn });
        }
        const next = sorted[index + 1];
        const nextParsed = next ? parseSlotTime(next.time) : null;
        if (nextParsed && parsed.end > nextParsed.start) {
          issues.push({ title: 'Пересечение слотов', detail: `${name}: "${slot.time}" пересекается со слотом "${next.time}".`, severity: 'critical', profileId, builtIn });
        }
      });
    };

    checkProfile('Обычный день', timeSlots, undefined, 'normal');
    if (settings.useShortenedPreHolidaySchedule) {
      checkProfile('Сокращённый день', timeSlotsShortened, undefined, 'shortened');
    }
    bellScheduleProfiles.forEach(profile => {
      checkProfile(profile.name, profile.slots, profile.id);
      if (profile.isActive && !profile.appliesToDates?.length && !profile.appliesToWeekdays?.length) {
        issues.push({ title: 'Нет правил применения', detail: `${profile.name}: активный режим не привязан к датам или дням недели.`, severity: 'warning', profileId: profile.id });
      }
    });

    schedule.forEach(entry => {
      const exists = timeSlots.some(slot => slot.id === entry.timeSlotId) || timeSlotsShortened.some(slot => slot.id === entry.timeSlotId);
      if (!exists) {
        issues.push({ title: 'Занятие с неизвестным слотом', detail: `В расписании есть занятие со слотом ${entry.timeSlotId}, которого нет в основных сетках.`, severity: 'warning' });
      }
    });

    return issues;
  }, [timeSlots, timeSlotsShortened, bellScheduleProfiles, settings, schedule]);

  const updateSlot = (dataType: 'timeSlots' | 'timeSlotsShortened', slot: TimeSlot, patch: Partial<TimeSlot>) => {
    updateItem(dataType, { ...slot, ...patch });
  };

  const addBuiltInSlot = (dataType: 'timeSlots' | 'timeSlotsShortened', shift: TimeSlotShift) => {
    const slots = dataType === 'timeSlots' ? timeSlots : timeSlotsShortened;
    addItem(dataType, createSlot(slots.length + 1, shift, dataType === 'timeSlots' ? 'ts' : 'tss'));
  };

  const copyNormalToShortened = () => {
    if (!window.confirm('Заменить сокращённую сетку слотами из обычной?')) return;
    timeSlotsShortened.forEach(slot => deleteItem('timeSlotsShortened', slot.id));
    timeSlots.forEach((slot, index) => {
      const { id: _id, ...slotWithoutId } = slot;
      addItem('timeSlotsShortened', {
        ...slotWithoutId,
        time: slot.time,
        order: slot.order || index + 1,
        name: slot.name || `${index + 1} пара`,
      });
    });
  };

  const generateShortenedFromNormal = () => {
    if (!window.confirm(`Сформировать сокращённую сетку из обычной, уменьшив каждую пару на ${compressMinutes} мин.?`)) return;
    timeSlotsShortened.forEach(slot => deleteItem('timeSlotsShortened', slot.id));
    timeSlots.forEach((slot, index) => {
      const parsed = parseSlotTime(slot.time);
      const { id: _id, ...slotWithoutId } = slot;
      const nextTime = parsed
        ? `${formatMinutes(parsed.start)}-${formatMinutes(Math.max(parsed.start + 30, parsed.end - compressMinutes))}`
        : slot.time;
      addItem('timeSlotsShortened', {
        ...slotWithoutId,
        time: nextTime,
        order: slot.order || index + 1,
        breakMinutesAfter: slot.breakMinutesAfter,
        name: slot.name || `${index + 1} пара`,
      });
    });
  };

  const shiftSecondShift = () => {
    activeBuiltInSlots
      .filter(slot => slot.shift === 'second')
      .forEach(slot => {
        const parsed = parseSlotTime(slot.time);
        if (!parsed) return;
        updateSlot(activeBuiltInDataType, slot, {
          time: `${formatMinutes(parsed.start + secondShiftOffset)}-${formatMinutes(parsed.end + secondShiftOffset)}`,
        });
      });
  };

  const saveProfile = () => {
    const payload = {
      ...profileDraft,
      name: profileDraft.name.trim(),
      slots: sortSlots(profileDraft.slots || []),
      appliesToDates: profileDraft.appliesToDates || [],
      appliesToWeekdays: profileDraft.appliesToWeekdays || [],
      formOfStudyIds: profileDraft.formOfStudyIds || [],
      buildingPlanIds: profileDraft.buildingPlanIds || [],
    };
    if (!payload.name) return;
    if (editingProfileId) {
      updateItem('bellScheduleProfiles', { ...(payload as BellScheduleProfile), id: editingProfileId });
    } else {
      const created = addItem('bellScheduleProfiles', payload as Omit<BellScheduleProfile, 'id'>) as BellScheduleProfile;
      setSelectedProfileId(created.id);
    }
    setProfileDraft(emptyProfileDraft());
    setEditingProfileId(null);
  };

  const editProfile = (profile: BellScheduleProfile) => {
    setProfileDraft({ ...profile, slots: profile.slots || [] });
    setEditingProfileId(profile.id);
    setSelectedProfileId(profile.id);
    setActiveTab('profiles');
  };

  const addSlotToDraft = (shift: TimeSlotShift) => {
    setProfileDraft(prev => ({
      ...prev,
      slots: [
        ...(prev.slots || []),
        { ...createSlot((prev.slots || []).length + 1, shift), id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      ],
    }));
  };

  const updateDraftSlot = (slotId: string, patch: Partial<TimeSlot>) => {
    setProfileDraft(prev => ({
      ...prev,
      slots: (prev.slots || []).map(slot => slot.id === slotId ? { ...slot, ...patch } : slot),
    }));
  };

  const removeDraftSlot = (slotId: string) => {
    setProfileDraft(prev => ({ ...prev, slots: (prev.slots || []).filter(slot => slot.id !== slotId) }));
  };

  const toggleWeekday = (day: number) => {
    setProfileDraft(prev => {
      const current = prev.appliesToWeekdays || [];
      return { ...prev, appliesToWeekdays: current.includes(day) ? current.filter(item => item !== day) : [...current, day] };
    });
  };

  const toggleForm = (form: FormOfStudy) => {
    setProfileDraft(prev => {
      const current = prev.formOfStudyIds || [];
      return { ...prev, formOfStudyIds: current.includes(form) ? current.filter(item => item !== form) : [...current, form] };
    });
  };

  const toggleBuilding = (buildingId: string) => {
    setProfileDraft(prev => {
      const current = prev.buildingPlanIds || [];
      return { ...prev, buildingPlanIds: current.includes(buildingId) ? current.filter(item => item !== buildingId) : [...current, buildingId] };
    });
  };

  const addDateToDraft = () => {
    const value = dateInput.trim();
    if (!value) return;
    setProfileDraft(prev => ({
      ...prev,
      appliesToDates: Array.from(new Set([...(prev.appliesToDates || []), value])).sort(),
    }));
    setDateInput('');
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'normal', label: 'Обычный день' },
    { id: 'shortened', label: 'Сокращённый день' },
    { id: 'profiles', label: 'Особые режимы' },
    { id: 'calendar', label: 'Календарь применения' },
    { id: 'quality', label: 'Проверка' },
  ];

  return (
    <div className="space-y-6 text-gray-900">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700">Управление временем</p>
          <h1 className="text-3xl font-bold text-gray-950">Сетки звонков и режимы учебного дня</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Единый инструмент для обычных, сокращённых и специальных расписаний звонков с проверкой пересечений, смен и правил применения.
          </p>
        </div>
        <button
          onClick={() => setActiveTab('quality')}
          className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold shadow-sm ${qualityIssues.length > 0 ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-green-600 text-white hover:bg-green-700'}`}
        >
          <AlertIcon className="h-5 w-5" />
          {qualityIssues.length > 0 ? `Проблем: ${qualityIssues.length}` : 'Время готово'}
        </button>
      </header>

      <div className="grid gap-3 md:grid-cols-5">
        <StatCard icon={<ClockIcon />} label="Всего слотов" value={totalSlots} hint="во всех сетках" />
        <StatCard icon={<CheckCircleIcon />} label="Обычный день" value={timeSlots.length} hint={`${timeSlots.filter(slot => slot.shift === 'first').length}/${timeSlots.filter(slot => slot.shift === 'second').length} по сменам`} />
        <StatCard icon={<CheckCircleIcon />} label="Сокращённый" value={timeSlotsShortened.length} hint={settings.useShortenedPreHolidaySchedule ? 'включён' : 'выключен'} />
        <StatCard icon={<PlusIcon />} label="Режимы" value={bellScheduleProfiles.length} hint="пользовательские профили" />
        <StatCard icon={<ClockIcon />} label="Смены" value={`${firstShiftSlots}/${secondShiftSlots}`} hint="первая / вторая" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === tab.id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="grid gap-4 lg:grid-cols-2">
            {allProfiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => {
                  if (profile.builtIn) {
                    setSelectedBuiltIn(profile.id as BuiltInProfileId);
                    setActiveTab(profile.id === 'normal' ? 'normal' : 'shortened');
                  } else {
                    setSelectedProfileId(profile.id);
                    setActiveTab('profiles');
                  }
                }}
                className="rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-cyan-300 hover:shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-950">{profile.name}</h2>
                    <p className="text-sm text-gray-500">{PROFILE_TYPE_LABELS[profile.type]} · {profile.slots.length} слотов</p>
                  </div>
                  <span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700">
                    {profile.slots.filter(slot => slot.shift === 'first').length}/{profile.slots.filter(slot => slot.shift === 'second').length}
                  </span>
                </div>
                <Timeline slots={profile.slots} />
              </button>
            ))}
          </section>
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Быстрые операции</h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-md bg-cyan-50 p-3 text-sm text-cyan-900">
                Сокращённая сетка остаётся совместимой с производственным календарём и настройкой предпраздничных дней.
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input label="Сжать пары на минут" type="number" value={compressMinutes} onChange={value => setCompressMinutes(Number(value) || 0)} />
                <button onClick={generateShortenedFromNormal} className="mt-6 rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
                  Сформировать
                </button>
              </div>
              <button onClick={copyNormalToShortened} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Скопировать обычную сетку в сокращённую
              </button>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input label="Сдвиг второй смены, мин." type="number" value={secondShiftOffset} onChange={value => setSecondShiftOffset(Number(value) || 0)} />
                <button onClick={shiftSecondShift} className="mt-6 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Сдвинуть
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {(activeTab === 'normal' || activeTab === 'shortened') && (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">{activeTab === 'normal' ? 'Обычный учебный день' : 'Сокращённый учебный день'}</h2>
              <p className="text-sm text-gray-500">Редактируйте слоты, смены, длительность перемен и служебные пометки.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => addBuiltInSlot(activeBuiltInDataType, 'first')} className="rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Добавить в 1 смену</button>
              <button onClick={() => addBuiltInSlot(activeBuiltInDataType, 'second')} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Добавить во 2 смену</button>
            </div>
          </div>
          <SlotEditor
            slots={sortSlots(activeBuiltInSlots)}
            onChange={(slot, patch) => updateSlot(activeBuiltInDataType, slot, patch)}
            onDelete={slot => deleteItem(activeBuiltInDataType, slot.id)}
          />
        </section>
      )}

      {activeTab === 'profiles' && (
        <div className="grid gap-6 xl:grid-cols-[430px_minmax(0,1fr)]">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">{editingProfileId ? 'Редактировать режим' : 'Новый режим учебного дня'}</h2>
            <div className="mt-4 space-y-3">
              <Input label="Название" value={profileDraft.name} onChange={value => setProfileDraft(prev => ({ ...prev, name: value }))} />
              <Select label="Тип режима" value={profileDraft.type} onChange={value => setProfileDraft(prev => ({ ...prev, type: value as BellScheduleProfileType }))} options={Object.entries(PROFILE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
              <Textarea label="Описание" value={profileDraft.description || ''} onChange={value => setProfileDraft(prev => ({ ...prev, description: value }))} />
              <div className="rounded-md border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">Слоты режима</p>
                  <div className="flex gap-2">
                    <button onClick={() => addSlotToDraft('first')} className="text-sm font-semibold text-cyan-700 hover:text-cyan-900">+ 1 смена</button>
                    <button onClick={() => addSlotToDraft('second')} className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">+ 2 смена</button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {sortSlots(profileDraft.slots || []).map(slot => (
                    <DraftSlotRow key={slot.id} slot={slot} onChange={patch => updateDraftSlot(slot.id, patch)} onDelete={() => removeDraftSlot(slot.id)} />
                  ))}
                  {(profileDraft.slots || []).length === 0 && <p className="text-sm text-gray-500">Добавьте слоты для этого режима.</p>}
                </div>
              </div>
              <RuleEditor
                profileDraft={profileDraft}
                dateInput={dateInput}
                setDateInput={setDateInput}
                addDate={addDateToDraft}
                removeDate={date => setProfileDraft(prev => ({ ...prev, appliesToDates: (prev.appliesToDates || []).filter(item => item !== date) }))}
                toggleWeekday={toggleWeekday}
                toggleForm={toggleForm}
                toggleBuilding={toggleBuilding}
                buildingPlans={buildingPlans}
              />
              <div className="flex gap-2">
                <button onClick={saveProfile} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
                  <PlusIcon className="h-5 w-5" />
                  {editingProfileId ? 'Сохранить режим' : 'Добавить режим'}
                </button>
                {editingProfileId && (
                  <button onClick={() => { setEditingProfileId(null); setProfileDraft(emptyProfileDraft()); }} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Отмена
                  </button>
                )}
              </div>
            </div>
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            {bellScheduleProfiles.map(profile => (
              <div key={profile.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-950">{profile.name}</h3>
                    <p className="text-sm text-gray-500">{PROFILE_TYPE_LABELS[profile.type]} · {profile.slots.length} слотов</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => editProfile(profile)} className="text-blue-700 hover:text-blue-900"><EditIcon /></button>
                    <button onClick={() => deleteItem('bellScheduleProfiles', profile.id)} className="text-red-600 hover:text-red-800"><TrashIcon /></button>
                  </div>
                </div>
                <Timeline slots={profile.slots} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {(profile.appliesToWeekdays || []).map(day => <Badge key={day}>{WEEKDAY_LABELS[day]}</Badge>)}
                  {(profile.appliesToDates || []).slice(0, 4).map(date => <Badge key={date}>{date}</Badge>)}
                  {profile.buildingPlanIds?.map(id => <Badge key={id}>{buildingPlans.find(plan => plan.id === id)?.name || 'Корпус удалён'}</Badge>)}
                </div>
              </div>
            ))}
            {bellScheduleProfiles.length === 0 && <EmptyState title="Особых режимов пока нет" text="Создайте режим для сессии, субботы, практики, пересдач или отдельного корпуса." />}
          </section>
        </div>
      )}

      {activeTab === 'calendar' && (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <h2 className="text-lg font-semibold text-gray-950">Календарь применения сеток</h2>
            <p className="text-sm text-gray-500">Здесь видно, какие режимы привязаны к датам, дням недели, формам обучения и корпусам.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {bellScheduleProfiles.map(profile => (
              <div key={profile.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[220px_1fr_1fr_1fr]">
                <div>
                  <p className="font-semibold text-gray-950">{profile.name}</p>
                  <p className="text-sm text-gray-500">{PROFILE_TYPE_LABELS[profile.type]}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Даты</p>
                  <div className="mt-1 flex flex-wrap gap-1">{profile.appliesToDates?.length ? profile.appliesToDates.map(date => <Badge key={date}>{date}</Badge>) : <span className="text-sm text-gray-500">Не заданы</span>}</div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Дни недели</p>
                  <div className="mt-1 flex flex-wrap gap-1">{profile.appliesToWeekdays?.length ? profile.appliesToWeekdays.map(day => <Badge key={day}>{WEEKDAY_LABELS[day]}</Badge>) : <span className="text-sm text-gray-500">Не заданы</span>}</div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Корпуса</p>
                  <div className="mt-1 flex flex-wrap gap-1">{profile.buildingPlanIds?.length ? profile.buildingPlanIds.map(id => <Badge key={id}>{buildingPlans.find(plan => plan.id === id)?.name || 'Корпус удалён'}</Badge>) : <span className="text-sm text-gray-500">Все</span>}</div>
                </div>
              </div>
            ))}
            {productionCalendar.filter(day => !day.isWorkDay).slice(0, 8).map(day => (
              <div key={day.id} className="px-4 py-3 text-sm text-gray-600">
                {day.date}: {day.name} · производственный календарь
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'quality' && (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <h2 className="text-lg font-semibold text-gray-950">Проверка временных сеток</h2>
            <p className="text-sm text-gray-500">Проверка ловит пустые сетки, неверный формат, пересечения, отсутствие смен и слоты, которые уже не существуют.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {qualityIssues.length === 0 ? (
              <EmptyState title="Замечаний нет" text="Сетки звонков готовы к планированию." />
            ) : qualityIssues.map((issue, index) => (
              <button
                key={`${issue.title}-${index}`}
                onClick={() => {
                  if (issue.builtIn) setActiveTab(issue.builtIn === 'normal' ? 'normal' : 'shortened');
                  if (issue.profileId) {
                    setSelectedProfileId(issue.profileId);
                    setActiveTab('profiles');
                  }
                }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${issue.severity === 'critical' ? 'bg-red-500' : issue.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                <span>
                  <span className="block text-sm font-semibold text-gray-950">{issue.title}</span>
                  <span className="block text-sm text-gray-600">{issue.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const SlotEditor: React.FC<{
  slots: TimeSlot[];
  onChange: (slot: TimeSlot, patch: Partial<TimeSlot>) => void;
  onDelete: (slot: TimeSlot) => void;
}> = ({ slots, onChange, onDelete }) => (
  <div className="divide-y divide-gray-100">
    {slots.map((slot, index) => (
      <div key={slot.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[90px_160px_150px_140px_1fr_auto] lg:items-end">
        <Input label="Номер" type="number" value={slot.order || index + 1} onChange={value => onChange(slot, { order: Number(value) || index + 1 })} />
        <Input label="Время" value={slot.time} onChange={value => onChange(slot, { time: value })} />
        <Select label="Смена" value={slot.shift || 'first'} onChange={value => onChange(slot, { shift: value as TimeSlotShift })} options={Object.entries(SHIFT_LABELS).map(([value, label]) => ({ value, label }))} />
        <Input label="Перемена" type="number" value={slot.breakMinutesAfter || 0} onChange={value => onChange(slot, { breakMinutesAfter: Number(value) || 0 })} />
        <Input label="Название" value={slot.name || `${index + 1} пара`} onChange={value => onChange(slot, { name: value })} />
        <button onClick={() => onDelete(slot)} className="rounded-md border border-red-200 p-2 text-red-700 hover:bg-red-50"><TrashIcon /></button>
      </div>
    ))}
    {slots.length === 0 && <EmptyState title="Сетка пустая" text="Добавьте слоты первой или второй смены." />}
  </div>
);

const DraftSlotRow: React.FC<{ slot: TimeSlot; onChange: (patch: Partial<TimeSlot>) => void; onDelete: () => void }> = ({ slot, onChange, onDelete }) => (
  <div className="grid gap-2 rounded-md bg-gray-50 p-2 lg:grid-cols-[120px_130px_90px_auto]">
    <input value={slot.time} onChange={event => onChange({ time: event.target.value })} className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
    <select value={slot.shift || 'first'} onChange={event => onChange({ shift: event.target.value as TimeSlotShift })} className="rounded-md border border-gray-300 px-2 py-1 text-sm">
      {Object.entries(SHIFT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <input type="number" value={slot.breakMinutesAfter || 0} onChange={event => onChange({ breakMinutesAfter: Number(event.target.value) || 0 })} className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
    <button onClick={onDelete} className="rounded-md border border-gray-300 px-2 py-1 text-sm text-red-700 hover:bg-white">Удалить</button>
  </div>
);

const RuleEditor: React.FC<{
  profileDraft: Omit<BellScheduleProfile, 'id'> | BellScheduleProfile;
  dateInput: string;
  setDateInput: (value: string) => void;
  addDate: () => void;
  removeDate: (date: string) => void;
  toggleWeekday: (day: number) => void;
  toggleForm: (form: FormOfStudy) => void;
  toggleBuilding: (buildingId: string) => void;
  buildingPlans: { id: string; name: string }[];
}> = ({ profileDraft, dateInput, setDateInput, addDate, removeDate, toggleWeekday, toggleForm, toggleBuilding, buildingPlans }) => (
  <div className="space-y-3 rounded-md border border-gray-200 p-3">
    <p className="text-sm font-semibold text-gray-800">Правила применения</p>
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <input type="date" value={dateInput} onChange={event => setDateInput(event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <button onClick={addDate} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Добавить дату</button>
    </div>
    <div className="flex flex-wrap gap-2">
      {(profileDraft.appliesToDates || []).map(date => (
        <button key={date} onClick={() => removeDate(date)} className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-100">{date} ×</button>
      ))}
    </div>
    <CheckboxPills label="Дни недели" options={WEEKDAY_LABELS.map((label, index) => ({ value: `${index}`, label }))} values={(profileDraft.appliesToWeekdays || []).map(String)} onToggle={value => toggleWeekday(Number(value))} />
    <CheckboxPills label="Формы обучения" options={Object.values(FormOfStudy).map(value => ({ value, label: value }))} values={profileDraft.formOfStudyIds || []} onToggle={value => toggleForm(value as FormOfStudy)} />
    <CheckboxPills label="Корпуса" options={buildingPlans.map(plan => ({ value: plan.id, label: plan.name }))} values={profileDraft.buildingPlanIds || []} onToggle={toggleBuilding} />
  </div>
);

const Timeline: React.FC<{ slots: TimeSlot[] }> = ({ slots }) => {
  const sorted = sortSlots(slots);
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {sorted.slice(0, 8).map(slot => (
        <span key={slot.id} className={`rounded-md px-2 py-1 text-xs font-semibold ${slot.shift === 'second' ? 'bg-indigo-50 text-indigo-700' : 'bg-cyan-50 text-cyan-700'}`}>
          {slot.time}
        </span>
      ))}
      {sorted.length > 8 && <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">+{sorted.length - 8}</span>}
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactElement<{ className?: string }>; label: string; value: string | number; hint: string }> = ({ icon, label, value, hint }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
        {React.cloneElement(icon, { className: 'h-5 w-5' })}
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-950">{value}</p>
      </div>
    </div>
    <p className="mt-3 text-sm text-gray-500">{hint}</p>
  </div>
);

const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{children}</span>
);

const EmptyState: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
    <ClockIcon className="mx-auto h-10 w-10 text-gray-300" />
    <h3 className="mt-3 text-base font-semibold text-gray-900">{title}</h3>
    <p className="mt-1 text-sm text-gray-500">{text}</p>
  </div>
);

const Input: React.FC<{ label: string; value: string | number; type?: string; onChange: (value: string) => void }> = ({ label, value, type = 'text', onChange }) => (
  <label className="block">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <input type={type} value={value} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500" />
  </label>
);

const Select: React.FC<{ label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }> = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <select value={value} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500">
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
);

const Textarea: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <textarea value={value} onChange={event => onChange(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500" />
  </label>
);

const CheckboxPills: React.FC<{ label: string; options: { value: string; label: string }[]; values: string[]; onToggle: (value: string) => void }> = ({ label, options, values, onToggle }) => (
  <div>
    <p className="text-sm font-medium text-gray-700">{label}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {options.length === 0 ? <span className="text-sm text-gray-500">Нет вариантов</span> : options.map(option => (
        <button
          key={option.value}
          onClick={() => onToggle(option.value)}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${values.includes(option.value) ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

export default BellScheduleManager;
