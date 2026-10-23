import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useStore } from '../hooks/useStore';
import { calculatePlanBalance } from '../services/planBalance';
import { DocumentDownloadIcon } from './icons';

export default function PlanBalanceView() {
    const store = useStore();
    const [groupId, setGroupId] = useState('');
    const [parity, setParity] = useState<'odd' | 'even' | 'all'>('odd');
    const [problemsOnly, setProblemsOnly] = useState(true);
    const rows = useMemo(() => calculatePlanBalance(store, { start: store.settings.semesterStart, end: store.settings.semesterEnd, parity }), [store.groups, store.educationalPlans, store.schedule, store.streams, store.subgroups, store.settings.semesterStart, store.settings.semesterEnd, parity]);
    const selected = rows.filter(row => !groupId || row.groupId === groupId);
    const visible = selected.filter(row => !problemsOnly || row.missingHours || row.excessHours);
    const name = (id: string) => store.groups.find(group => group.id === id)?.number || id;
    const subject = (id: string) => store.subjects.find(item => item.id === id)?.name || id;
    const exportRows = () => {
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(visible.map(row => ({ Группа: name(row.groupId), Дисциплина: subject(row.subjectId), Тип: row.classType, Подгруппа: row.subgroupId || '', 'План, ч': row.requiredHours, 'Сетка, ч': row.scheduledHours, 'Дефицит, ч': row.missingHours, 'Избыток, ч': row.excessHours }))), 'Баланс часов');
        XLSX.writeFile(book, 'plan-balance.xlsx');
    };
    return <section className="space-y-4" aria-label="Баланс плана и расписания">
        <div className="flex flex-wrap items-center gap-3">
            <select aria-label="Группа для сверки" value={groupId} onChange={event => setGroupId(event.target.value)} className="rounded border p-2"><option value="">Все группы</option>{store.groups.map(group => <option key={group.id} value={group.id}>{group.number}</option>)}</select>
            <select aria-label="Семестры для сверки" value={parity} onChange={event => setParity(event.target.value as typeof parity)} className="rounded border p-2"><option value="odd">Нечётные семестры</option><option value="even">Чётные семестры</option><option value="all">Все семестры курса</option></select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={problemsOnly} onChange={event => setProblemsOnly(event.target.checked)} />Только расхождения</label>
            <button title="Экспорт баланса в Excel" onClick={exportRows} className="rounded border p-2"><DocumentDownloadIcon className="h-5 w-5" /></button>
        </div>
        <div className="flex flex-wrap gap-6 border-y py-3 text-sm">{[['План', 'requiredHours'], ['В сетке', 'scheduledHours'], ['Не хватает', 'missingHours'], ['Сверх плана', 'excessHours']].map(([label, key]) => <p key={key}>{label}: <strong>{selected.reduce((sum, row) => sum + row[key], 0)} ч</strong></p>)}</div>
        {!!store.groups.filter(group => !store.educationalPlans.some(plan => plan.id === rows.find(row => row.groupId === group.id)?.planId)).length && <p className="text-sm text-amber-800">Проверьте назначение учебных планов и выбранные семестры для групп без плановых часов.</p>}
        <div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-gray-100"><tr>{['Группа / подгруппа', 'Дисциплина', 'Тип', 'План, ч', 'Сетка, ч', 'Дефицит', 'Избыток'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{visible.map((row, index) => <tr key={index} className="border-b"><td className="p-2">{name(row.groupId)}{row.subgroupId && ` / ${store.subgroups.find(item => item.id === row.subgroupId)?.name || row.subgroupId}`}</td><td className="p-2">{subject(row.subjectId)}</td><td className="p-2">{row.classType}</td><td className="p-2">{row.requiredHours}</td><td className="p-2">{row.scheduledHours}</td><td className="p-2 text-red-700">{row.missingHours || ''}</td><td className="p-2 text-amber-800">{row.excessHours || ''}</td></tr>)}</tbody></table>{!visible.length && <p className="py-6 text-sm text-gray-500">Расхождений по выбранным условиям нет.</p>}</div>
    </section>;
}
