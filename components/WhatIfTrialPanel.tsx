import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useStore } from '../hooks/useStore';
import { Group, SchedulingProgressPoint } from '../types';
import { buildWhatIfScenario } from '../services/whatIfTrial';
import { runIterativeScheduler } from '../services/iterativeScheduler';
import { SchedulerResult } from '../services/heuristicScheduler';
import { planningSignature } from '../services/scheduleRepair';
import { getPlanForGroup } from '../utils/educationUtils';
import { DocumentDownloadIcon } from './icons';

interface Props { groupIds: string[]; plannedGroups: Partial<Group>[]; removedTeacherId?: string; closedClassroomId?: string; }
export default function WhatIfTrialPanel(props: Props) {
    const store = useStore(); const stop = useRef(false); const mounted = useRef(true);
    const [mode, setMode] = useState<'rebuild' | 'complete'>('rebuild'); const [iterations, setIterations] = useState(4);
    const [parity, setParity] = useState<'odd' | 'even' | 'all'>(new Date(store.settings.semesterStart + 'T00:00:00').getMonth() >= 6 ? 'odd' : 'even');
    const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [progress, setProgress] = useState<SchedulingProgressPoint | null>(null);
    const [report, setReport] = useState<{ result: SchedulerResult; warnings: string[]; source: string; groupNames: string[]; retained: number } | null>(null);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
    const sourceSignature = () => planningSignature(store) + JSON.stringify(props);
    const run = async () => {
        stop.current = false; setBusy(true); setError(''); setReport(null); setProgress(null);
        try {
            const source = sourceSignature(); const scenario = buildWhatIfScenario(store, { ...props, mode, iterations, semesterParity: parity });
            const missingPlans = scenario.data.groups.filter(group => scenario.scopeGroupIds.includes(group.id) && !getPlanForGroup(group, scenario.data.educationalPlans));
            if (missingPlans.length) scenario.warnings.push(`Нет совместимого учебного плана: ${missingPlans.map(group => group.number).join(', ')}.`);
            const result = await runIterativeScheduler(scenario.data, scenario.config, () => {}, { shouldStop: () => stop.current, onProgress: point => { if (mounted.current) setProgress(point); } });
            if (mounted.current) setReport({ result, warnings: scenario.warnings, source, groupNames: scenario.data.groups.filter(group => scenario.scopeGroupIds.includes(group.id)).map(group => group.number), retained: scenario.data.schedule.length });
        } catch (error) { if (mounted.current) setError(error.message); } finally { if (mounted.current) setBusy(false); }
    };
    const exportReport = () => { if (!report) return; const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(report.result.schedule), 'Пробное расписание'); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(report.result.unschedulable.map(entry => ({ subjectId: entry.subjectId, groupId: entry.groupId || entry.groupIds?.join(', '), classType: entry.classType, reason: entry.explanation?.summary || report.result.explanations[entry.uid]?.summary || '' }))), 'Не распределено'); XLSX.writeFile(book, 'what-if-trial.xlsx'); };
    return <section aria-label="Пробное составление сценария" className="space-y-3 border-y border-gray-300 py-4 xl:col-span-3"><header className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Пробное составление</h2><div className="flex gap-2">{report && <button title="Экспорт пробного расчёта" onClick={exportReport} className="rounded border p-2"><DocumentDownloadIcon className="h-5 w-5" /></button>}{busy ? <button onClick={() => { stop.current = true; }} className="rounded border px-3 py-2 text-sm">Остановить пробный расчёт</button> : <button disabled={!!store.schedulingProgress} onClick={run} className="rounded bg-teal-700 px-3 py-2 text-sm text-white disabled:opacity-40">Запустить пробный расчёт</button>}</div></header>
        <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Режим<select disabled={busy} value={mode} onChange={event => setMode(event.target.value as typeof mode)} className="ml-2 rounded border p-2"><option value="rebuild">Пересоставить область сценария</option><option value="complete">Достроить текущую сетку</option></select></label><label className="text-sm">Итерации<input aria-label="Итерации пробного расчёта" type="number" min="1" max="20" disabled={busy} value={iterations} onChange={event => setIterations(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} className="ml-2 w-20 rounded border p-2" /></label><select aria-label="Семестр пробного расчёта" value={parity} disabled={busy} onChange={event => setParity(event.target.value as typeof parity)} className="rounded border p-2 text-sm"><option value="odd">Нечётный семестр</option><option value="even">Чётный семестр</option><option value="all">Оба семестра</option></select></div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{busy && <p role="status" className="text-sm text-gray-600">{progress?.label || 'Подготовка независимой копии проекта...'}{progress ? ` Размещено ${progress.placed}/${progress.total}.` : ''}</p>}
        {report && <div className="space-y-3" data-testid="what-if-result"><p className="text-sm font-medium">{report.result.interrupted ? 'Пробный расчёт остановлен' : 'Пробный расчёт завершён'}. Основное расписание не изменено.</p><p className="text-sm">Область: {report.groupNames.join(', ')}. Размещено: {report.result.schedule.length}. Не распределено: {report.result.unschedulable.length}. Жёстких нарушений в результате: {report.result.score?.hardViolations || 0}. Штраф: {Math.round(report.result.score?.total || 0)}.</p>
            {report.source !== sourceSignature() && <p className="text-sm text-amber-800">Исходные данные изменились. Показан результат предыдущего снимка.</p>}{report.warnings.map(warning => <p key={warning} className="text-sm text-amber-800">{warning}</p>)}
            <div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-gray-100"><tr><th className="p-2">Дисциплина / тип</th><th className="p-2">Группа</th><th className="p-2">Причина отказа</th></tr></thead><tbody>{report.result.unschedulable.slice(0, 100).map(entry => <tr key={entry.uid} className="border-b"><td className="p-2">{store.subjects.find(subject => subject.id === entry.subjectId)?.name} · {entry.classType}</td><td className="p-2">{(entry.groupIds || [entry.groupId]).map(id => store.groups.find(group => group.id === id)?.number || props.plannedGroups.find(group => group.id === id)?.number || id).join(', ')}</td><td className="p-2 text-red-800">{entry.explanation?.summary || report.result.explanations[entry.uid]?.summary}</td></tr>)}</tbody></table></div>
        </div>}
    </section>;
}
