import React, { useMemo, useState } from 'react';
import { FolderIcon, PlusIcon, DocumentTextIcon, ClockIcon, DocumentSearchIcon, DocumentDownloadIcon, UploadIcon, CogIcon } from './icons';
import { useStore } from '../hooks/useStore';

const APP_VERSION = '3401.2604.2026';

interface SplashScreenProps {
    onFinish: () => void;
    onOpenProject?: () => void;
    onNewProject?: () => void;
}

interface RecentProject {
    name: string;
    path: string;
    lastModified: string;
    size: string;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish, onOpenProject, onNewProject }) => {
    const {
        currentFilePath,
        lastAutosave,
        groups,
        teachers,
        classrooms,
        subjects,
        schedule,
        unscheduledEntries,
        handleOpen,
        handleSave,
        handleSaveAs,
        openRecentProject,
    } = useStore();
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [statusMessage, setStatusMessage] = useState('');

    React.useEffect(() => {
        const stored = localStorage.getItem('recentProjects');
        if (stored) {
            try {
                const projects = JSON.parse(stored) as RecentProject[];
                setRecentProjects(projects.slice(0, 10));
            } catch (e) {
                console.error('Failed to load recent projects', e);
            }
        }
    }, [statusMessage]);

    const projectName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : 'Новый проект';
    const projectStats = useMemo(() => [
        { label: 'Группы', value: groups.length },
        { label: 'Преподаватели', value: teachers.length },
        { label: 'Аудитории', value: classrooms.length },
        { label: 'Дисциплины', value: subjects.length },
        { label: 'Занятия', value: schedule.length },
        { label: 'Нераспределено', value: unscheduledEntries.length },
    ], [groups.length, teachers.length, classrooms.length, subjects.length, schedule.length, unscheduledEntries.length]);

    const quickStart = [
        { title: 'Импортировать данные', text: 'JSON, XLSX и CSV для учебных планов и справочников.', icon: UploadIcon },
        { title: 'Запустить генератор', text: 'Эвристика, AI и объяснения причин нераспределения.', icon: CogIcon },
        { title: 'Подготовить формы', text: 'Печать и Excel по группе, преподавателю, аудитории.', icon: DocumentDownloadIcon },
        { title: 'Проверить качество', text: 'Окна, перегрузки, конфликты ресурсов и правил.', icon: DocumentSearchIcon },
    ];

    const handleNewProject = () => {
        onNewProject?.();
        onFinish();
    };

    const handleOpenProject = async () => {
        if (onOpenProject) {
            onOpenProject();
            onFinish();
            return;
        }
        await handleOpen();
        onFinish();
    };

    const handleSaveProject = async () => {
        await handleSave();
        setStatusMessage('Проект сохранен.');
    };

    const handleSaveProjectAs = async () => {
        await handleSaveAs();
        setStatusMessage('Проект сохранен как новый файл.');
    };

    const handleOpenRecent = async (projectPath: string) => {
        const opened = await openRecentProject(projectPath);
        if (opened) {
            onFinish();
        } else {
            setStatusMessage('Не удалось открыть недавний проект.');
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-gray-100 text-gray-900 overflow-hidden">
            <div className="h-full grid grid-cols-[280px_1fr]">
                <aside className="bg-[#f3f3f3] border-r border-gray-300 flex flex-col">
                    <div className="px-6 py-7 border-b border-gray-300">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-md bg-blue-700 text-white flex items-center justify-center">
                                <DocumentTextIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-xl font-semibold">Расписание ВУЗ</h1>
                                <p className="text-xs text-gray-500">Версия {APP_VERSION}</p>
                            </div>
                        </div>
                    </div>

                    <nav className="p-3 space-y-1">
                        <button onClick={handleNewProject} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-white hover:shadow-sm transition">
                            <PlusIcon className="w-5 h-5 text-blue-700" />
                            <span className="font-medium">Создать</span>
                        </button>
                        <button onClick={handleOpenProject} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-white hover:shadow-sm transition">
                            <FolderIcon className="w-5 h-5 text-blue-700" />
                            <span className="font-medium">Открыть</span>
                        </button>
                        <button onClick={handleSaveProject} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-white hover:shadow-sm transition">
                            <DocumentDownloadIcon className="w-5 h-5 text-blue-700" />
                            <span className="font-medium">Сохранить</span>
                        </button>
                        <button onClick={handleSaveProjectAs} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-white hover:shadow-sm transition">
                            <DocumentTextIcon className="w-5 h-5 text-blue-700" />
                            <span className="font-medium">Сохранить как</span>
                        </button>
                    </nav>

                    <div className="mt-auto p-6 text-xs text-gray-500 space-y-2">
                        {statusMessage && <p className="text-blue-700 font-medium">{statusMessage}</p>}
                        <p>Файл: {projectName}</p>
                        <p>Автосохранение: {lastAutosave ? lastAutosave.toLocaleTimeString('ru-RU') : 'ожидает изменений'}</p>
                    </div>
                </aside>

                <main className="h-full overflow-y-auto">
                    <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">
                        <section className="flex flex-wrap items-start justify-between gap-6">
                            <div>
                                <p className="text-sm font-medium text-blue-700">Центр управления проектом</p>
                                <h2 className="text-4xl font-semibold tracking-normal mt-1">Добро пожаловать</h2>
                                <p className="text-gray-600 mt-2 max-w-2xl">
                                    Откройте последний проект, сохраните текущие данные или начните новый учебный период. Сводка ниже помогает понять, насколько проект готов к генерации расписания.
                                </p>
                            </div>
                            <button onClick={onFinish} className="px-4 py-2 rounded-md bg-blue-700 text-white font-medium hover:bg-blue-800 transition">
                                Продолжить работу
                            </button>
                        </section>

                        <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
                            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ClockIcon className="w-5 h-5 text-blue-700" />
                                        <h3 className="text-lg font-semibold">Последние проекты</h3>
                                    </div>
                                    <span className="text-xs text-gray-500">{recentProjects.length} в списке</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {recentProjects.length > 0 ? recentProjects.map(project => (
                                        <button
                                            key={project.path}
                                            onClick={() => handleOpenRecent(project.path)}
                                            className="w-full text-left px-5 py-4 hover:bg-blue-50 transition flex items-center justify-between gap-4"
                                        >
                                            <div className="min-w-0 flex items-center gap-3">
                                                <DocumentTextIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="font-medium text-gray-900 truncate">{project.name}</p>
                                                    <p className="text-sm text-gray-500 truncate">{project.path}</p>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-xs text-gray-500">{new Date(project.lastModified).toLocaleDateString('ru-RU')}</p>
                                                <p className="text-xs text-gray-400">{project.size}</p>
                                            </div>
                                        </button>
                                    )) : (
                                        <div className="px-5 py-12 text-center text-gray-500">
                                            <FolderIcon className="w-10 h-10 mx-auto text-gray-300" />
                                            <p className="mt-3 font-medium">Недавних проектов пока нет</p>
                                            <p className="text-sm">Откройте или сохраните `.schd`, и он появится здесь.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                                <div className="px-5 py-4 border-b border-gray-200">
                                    <h3 className="text-lg font-semibold">Состояние проекта</h3>
                                    <p className="text-sm text-gray-500 truncate">{currentFilePath || 'Проект еще не сохранен в файл'}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-px bg-gray-100">
                                    {projectStats.map(stat => (
                                        <div key={stat.label} className="bg-white p-4">
                                            <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
                                            <p className="text-sm text-gray-500">{stat.label}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            {quickStart.map(item => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.title} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                                        <Icon className="w-7 h-7 text-blue-700" />
                                        <h3 className="font-semibold mt-4">{item.title}</h3>
                                        <p className="text-sm text-gray-600 mt-1">{item.text}</p>
                                    </div>
                                );
                            })}
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default SplashScreen;
