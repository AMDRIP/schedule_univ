import React, { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { ClassType } from '../types';
import { linkSubjectRoomTypes } from '../utils/trajectories';
import { LinkIcon } from './icons';

export default function SubjectRoomLinks() {
    const store = useStore();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [subjects, setSubjects] = useState<string[]>([]);
    const [classTypes, setClassTypes] = useState<ClassType[]>([ClassType.Lecture]);
    const [typeIds, setTypeIds] = useState<string[]>([]);
    const [mode, setMode] = useState<'add' | 'replace'>('add');
    const [message, setMessage] = useState('');
    const toggle = <T extends string>(list: T[], id: T) => list.includes(id) ? list.filter(value => value !== id) : [...list, id];
    const visible = store.subjects.filter(subject => subject.name.toLowerCase().includes(query.toLowerCase()));
    return <section className="border-y py-3"><button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2 text-sm font-semibold text-teal-800"><LinkIcon className="h-4 w-4" />Быстрая привязка типов аудиторий</button>
        {open && <form aria-label="Быстрая привязка типов аудиторий" className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); if (!subjects.length || !classTypes.length || !typeIds.length) { setMessage('Выберите дисциплины, типы занятий и типы аудиторий.'); return; } subjects.forEach(id => { const subject = store.subjects.find(item => item.id === id); if (subject) store.updateItem('subjects', linkSubjectRoomTypes(subject, classTypes, typeIds, mode)); }); setMessage(`Обновлено дисциплин: ${subjects.length}`); }}>
            <div className="grid gap-5 lg:grid-cols-3"><fieldset><legend className="mb-2 text-sm font-semibold">Дисциплины</legend><input aria-label="Поиск дисциплин для привязки" value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск" className="mb-2 w-full rounded border p-2 text-sm" /><label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!visible.length && visible.every(item => subjects.includes(item.id))} onChange={event => setSubjects(event.target.checked ? [...new Set([...subjects, ...visible.map(item => item.id)])] : subjects.filter(id => !visible.some(item => item.id === id)))} />Все найденные</label><div className="max-h-52 space-y-2 overflow-auto">{visible.map(subject => <label key={subject.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={subjects.includes(subject.id)} onChange={() => setSubjects(toggle(subjects, subject.id))} className="mt-1" />{subject.name}</label>)}</div></fieldset>
                <fieldset><legend className="mb-2 text-sm font-semibold">Типы занятий</legend><div className="max-h-64 space-y-2 overflow-auto">{Object.values(ClassType).map(type => <label key={type} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={classTypes.includes(type)} onChange={() => setClassTypes(toggle(classTypes, type))} />{type}</label>)}</div></fieldset>
                <fieldset><legend className="mb-2 text-sm font-semibold">Допустимые типы аудиторий</legend><div className="max-h-64 space-y-2 overflow-auto">{store.classroomTypes.map(type => <label key={type.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={typeIds.includes(type.id)} onChange={() => setTypeIds(toggle(typeIds, type.id))} />{type.name}<span className="text-xs text-gray-500">{store.classrooms.filter(room => room.typeId === type.id && room.status !== 'closed' && room.status !== 'repair').length} ауд.</span></label>)}</div></fieldset></div>
            <div className="flex flex-wrap items-center gap-4"><label className="text-sm"><input type="radio" checked={mode === 'add'} onChange={() => setMode('add')} className="mr-2" />Дополнить</label><label className="text-sm"><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mr-2" />Заменить для выбранных типов занятий</label><button className="rounded bg-teal-700 px-3 py-2 text-sm text-white">Применить привязки</button>{message && <span role="status" className="text-sm">{message}</span>}</div>
        </form>}
    </section>;
}
