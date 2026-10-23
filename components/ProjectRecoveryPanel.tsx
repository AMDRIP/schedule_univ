import React, { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { ClockIcon, FolderIcon, UploadIcon, DocumentDownloadIcon } from './icons';

type Backup = Awaited<ReturnType<NonNullable<Window['electronAPI']['listProjectBackups']>>>[number];
const button = 'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-40';
const ProjectRecoveryPanel: React.FC = () => {
    const { currentFilePath, loadFullState, handleSave } = useStore();
    const [selected, setSelected] = useState<string | null>(null), [copies, setCopies] = useState<Backup[]>([]);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
    const filename = selected || currentFilePath;
    const refresh = async (file = filename) => { if (file) setCopies(await window.electronAPI.listProjectBackups(file)); else setCopies([]); };
    useEffect(() => { setCopies([]); let active = true; if (filename && window.electronAPI?.listProjectBackups) window.electronAPI.listProjectBackups(filename).then(value => { if (active) setCopies(value); }).catch(() => { if (active) setError('Не удалось прочитать резервные копии.'); }); return () => { active = false; }; }, [filename]);
    const action = async (operation: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await operation(); } catch (problem) { setError(String(problem instanceof Error ? problem.message : problem).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); } finally { setBusy(false); } };
    return <section aria-label="Резервные копии проектов" className="min-w-0 border-t pt-6 space-y-3">
        <h3 className="text-xl font-semibold text-gray-800">Резервные копии проектов</h3>
        <p className="break-all text-sm text-gray-600">{filename || 'Проект не выбран'}</p>
        <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy || !window.electronAPI?.chooseProjectForRecovery} onClick={() => action(async () => { const file = await window.electronAPI.chooseProjectForRecovery(); if (file) { setSelected(file); await refresh(file); } })}><FolderIcon className="h-4 w-4" />Выбрать проект</button>
            <button type="button" className={button} disabled={busy || !filename || !window.electronAPI?.listProjectBackups} onClick={() => action(() => refresh())}><ClockIcon className="h-4 w-4" />Обновить список</button>
            <button type="button" className={button} disabled={busy || !currentFilePath || !!selected && selected !== currentFilePath || !window.electronAPI?.createProjectBackup} onClick={() => action(async () => { if (!await handleSave()) return; await window.electronAPI.createProjectBackup(currentFilePath); await refresh(); setMessage('Резервная копия создана.'); })}><DocumentDownloadIcon className="h-4 w-4" />Создать резервную копию</button>
        </div>
        {error && <p role="alert" className="text-sm text-red-700 break-words">{error}</p>}{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="border-b text-gray-500"><tr><th className="py-2">Дата копии</th><th>Размер</th><th>Состояние</th><th className="text-right">Действие</th></tr></thead><tbody>{copies.map(copy => <tr key={copy.id} className="border-b"><td className="py-3">{new Date(copy.createdAt).toLocaleString('ru-RU')}</td><td>{(copy.size / 1024).toFixed(1)} КБ</td><td>{copy.valid ? 'Доступна' : 'Повреждена'}</td><td className="text-right"><button type="button" aria-label={`Восстановить копию ${copy.id}`} className={button} disabled={busy || !copy.valid} onClick={() => { if (window.confirm('Восстановить эту копию? Несохранённые изменения в открытой сетке будут потеряны. Текущий файл проекта сначала сохранится в истории.')) action(async () => { const result = await window.electronAPI.restoreProjectBackup(filename, copy.id); const data = JSON.parse(result.data); loadFullState({ ...data, currentFilePath: result.filePath }); await refresh(); setMessage('Проект восстановлен из резервной копии.'); }); }}><UploadIcon className="h-4 w-4" />Восстановить</button></td></tr>)}</tbody></table></div>
        {!copies.length && <p className="text-sm text-gray-500">Резервных копий нет.</p>}
    </section>;
};
export default ProjectRecoveryPanel;
