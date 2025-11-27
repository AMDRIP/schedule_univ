import React, { useState } from 'react';
import { FolderIcon, PlusIcon, DocumentTextIcon, ClockIcon } from './icons';

interface SplashScreenProps {
    onFinish: () => void;
    onOpenProject?: () => void;
    onNewProject?: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish, onOpenProject, onNewProject }) => {
    const [recentProjects, setRecentProjects] = useState<Array<{ name: string; path: string; lastModified: Date; size: string }>>([]);

    // Load recent projects from localStorage
    React.useEffect(() => {
        const stored = localStorage.getItem('recentProjects');
        if (stored) {
            try {
                const projects = JSON.parse(stored);
                setRecentProjects(projects.slice(0, 5)); // Show only 5 most recent
            } catch (e) {
                console.error('Failed to load recent projects', e);
            }
        }
    }, []);

    const handleOpenProject = () => {
        if (onOpenProject) {
            onOpenProject();
        }
        onFinish();
    };

    const handleNewProject = () => {
        if (onNewProject) {
            onNewProject();
        }
        onFinish();
    };

    const handleOpenRecent = (projectPath: string) => {
        // In a real implementation, this would load the project
        console.log('Opening project:', projectPath);
        onFinish();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-blue-900 text-white overflow-hidden">
            {/* Animated background elements */}
            <div className="absolute inset-0 overflow-hidden opacity-20">
                <div className="absolute top-20 left-20 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
                <div className="absolute top-40 right-20 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-32 left-40 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 w-full max-w-6xl mx-auto p-8">
                {/* Logo and Title */}
                <div className="text-center mb-12 animate-fade-in-down">
                    <div className="mb-6 inline-block p-6 bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-24 h-24 text-white">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.499 5.216 50.552 50.552 0 00-2.658.813m-15.482 0A50.55 50.55 0 0112 13.489a50.55 50.55 0 0112-1.617" />
                        </svg>
                    </div>
                    <h1 className="text-6xl font-extrabold tracking-tight mb-3 drop-shadow-2xl bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-purple-100">
                        Расписание ВУЗ
                    </h1>
                    <p className="text-2xl font-light text-blue-100 tracking-wider">
                        Система интеллектуального планирования
                    </p>
                </div>

                {/* Action Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    {/* Create New Project Card */}
                    <button
                        onClick={handleNewProject}
                        className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 border-2 border-white/20 hover:border-white/40 transition-all duration-300 hover:scale-105 hover:shadow-2xl"
                    >
                        <div className="flex flex-col items-center text-center">
                            <div className="mb-6 p-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-xl group-hover:scale-110 transition-transform duration-300">
                                <PlusIcon className="w-16 h-16 text-white" />
                            </div>
                            <h2 className="text-3xl font-bold mb-3">Создать новый проект</h2>
                            <p className="text-blue-100 text-lg">Начните с чистого листа и настройте новое расписание для вашего учебного заведения</p>
                        </div>
                    </button>

                    {/* Open Existing Project Card */}
                    <button
                        onClick={handleOpenProject}
                        className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 border-2 border-white/20 hover:border-white/40 transition-all duration-300 hover:scale-105 hover:shadow-2xl"
                    >
                        <div className="flex flex-col items-center text-center">
                            <div className="mb-6 p-6 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl shadow-xl group-hover:scale-110 transition-transform duration-300">
                                <FolderIcon className="w-16 h-16 text-white" />
                            </div>
                            <h2 className="text-3xl font-bold mb-3">Открыть существующий</h2>
                            <p className="text-blue-100 text-lg">Продолжите работу с сохранённым проектом расписания</p>
                        </div>
                    </button>
                </div>

                {/* Recent Projects */}
                {recentProjects.length > 0 && (
                    <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 animate-fade-in-up">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <ClockIcon className="w-6 h-6" />
                            Недавние проекты
                        </h3>
                        <div className="space-y-2">
                            {recentProjects.map((project, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleOpenRecent(project.path)}
                                    className="w-full text-left px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors duration-200 flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-3">
                                        <DocumentTextIcon className="w-5 h-5 text-blue-300" />
                                        <div>
                                            <p className="font-semibold text-white group-hover:text-blue-200 transition-colors">{project.name}</p>
                                            <p className="text-sm text-gray-400">{project.path}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400">{new Date(project.lastModified).toLocaleDateString('ru-RU')}</p>
                                        <p className="text-xs text-gray-500">{project.size}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes blob {
                    0%, 100% { transform: translate(0px, 0px) scale(1); }
                    33% { transform: translate(30px, -50px) scale(1.1); }
                    66% { transform: translate(-20px, 20px) scale(0.9); }
                }
                .animate-blob {
                    animation: blob 7s infinite;
                }
                .animation-delay-2000 {
                    animation-delay: 2s;
                }
                .animation-delay-4000 {
                    animation-delay: 4s;
                }
                @keyframes fade-in-down {
                    0% { opacity: 0; transform: translateY(-20px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-down {
                    animation: fade-in-down 0.8s ease-out forwards;
                }
                @keyframes fade-in-up {
                    0% { opacity: 0; transform: translateY(20px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.8s ease-out 0.3s forwards;
                    opacity: 0;
                }
            `}</style>
        </div>
    );
};

export default SplashScreen;

