import React from 'react';
import { CogIcon, DocumentSearchIcon, DocumentDownloadIcon, UploadIcon } from './icons';
import { useStore } from '../hooks/useStore';

const AutoScheduler: React.FC = () => {
  const { unscheduledEntries, lastSchedulingRunSummary, schedulingExplanations } = useStore();
  const explainedCount = Object.keys(schedulingExplanations).length;
  const bottlenecks = unscheduledEntries.reduce<Record<string, number>>((acc, entry) => {
    const resource = entry.explanation?.resource || 'Без диагностики';
    acc[resource] = (acc[resource] || 0) + 1;
    return acc;
  }, {});
  const topBottlenecks = Object.entries(bottlenecks).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-lg shadow-lg">
        <div className="flex items-start gap-4">
          <CogIcon className="h-14 w-14 text-blue-500 flex-shrink-0" />
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Автоматическое составление расписания</h2>
            <p className="mt-2 text-gray-600">
              Запуск генерации находится в меню <strong>Планировщик</strong> в верхней панели. После прогона здесь отображается диагностика: что изменилось, какие ограничения сработали и какой ресурс стал узким местом.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-lg shadow">
          <DocumentSearchIcon className="w-7 h-7 text-indigo-600 mb-3" />
          <p className="text-sm text-gray-500">Диагностировано занятий</p>
          <p className="text-3xl font-bold text-gray-900">{explainedCount}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow">
          <UploadIcon className="w-7 h-7 text-green-600 mb-3" />
          <p className="text-sm text-gray-500">Нераспределено сейчас</p>
          <p className="text-3xl font-bold text-gray-900">{unscheduledEntries.length}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow">
          <DocumentDownloadIcon className="w-7 h-7 text-slate-600 mb-3" />
          <p className="text-sm text-gray-500">Итог последнего прогона</p>
          <p className="text-sm font-semibold text-gray-800 mt-1">{lastSchedulingRunSummary || 'Генератор еще не запускался.'}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Узкие места</h3>
        {topBottlenecks.length > 0 ? (
          <div className="space-y-3">
            {topBottlenecks.map(([resource, count]) => (
              <div key={resource} className="flex items-center justify-between border-b pb-2">
                <span className="font-medium text-gray-700">{resource}</span>
                <span className="text-sm text-gray-500">{count} занятий</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">После следующего прогона здесь появится разбор конфликтов.</p>
        )}
      </div>
    </div>
  );
};

export default AutoScheduler;
