import React, { useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { AlertIcon, CheckCircleIcon, CogIcon, SparklesIcon } from './icons';

const formatPenalty = (value = 0) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} тыс.`;
  return Math.round(value).toLocaleString('ru-RU');
};

const formatTime = (ms = 0) => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const PenaltyChart: React.FC<{ points: NonNullable<ReturnType<typeof useStore>['schedulingShowcase']>['history'] }> = ({ points }) => {
  const chart = useMemo(() => {
    const width = 760;
    const height = 260;
    const padding = 28;
    const visible = points.length > 1 ? points : [
      { timeMs: 0, penalty: 1, readiness: 0, placed: 0, processed: 0, total: 1, unscheduled: 0, hardViolations: 0, softPenalty: 0, label: 'Старт' },
      { timeMs: 1, penalty: 1, readiness: 0, placed: 0, processed: 0, total: 1, unscheduled: 0, hardViolations: 0, softPenalty: 0, label: 'Старт' },
    ];
    const maxPenalty = Math.max(...visible.map(point => point.penalty), 1);
    const minPenalty = Math.min(...visible.map(point => point.penalty), 0);
    const range = Math.max(1, maxPenalty - minPenalty);
    const path = visible.map((point, index) => {
      const x = padding + (index / Math.max(1, visible.length - 1)) * (width - padding * 2);
      const y = padding + ((point.penalty - minPenalty) / range) * (height - padding * 2);
      const invertedY = height - y;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${invertedY.toFixed(1)}`;
    }).join(' ');
    return { width, height, path, maxPenalty, minPenalty };
  }, [points]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Падение штрафов</h3>
          <p className="text-xs text-slate-500">Красная зона сверху, зелёная внизу. Чем ниже линия, тем спокойнее расписание.</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Пик: {formatPenalty(chart.maxPenalty)}</div>
          <div>Низ: {formatPenalty(chart.minPenalty)}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-64 w-full">
        <defs>
          <linearGradient id="penalty-zone" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fee2e2" />
            <stop offset="48%" stopColor="#fef3c7" />
            <stop offset="100%" stopColor="#dcfce7" />
          </linearGradient>
          <linearGradient id="penalty-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="55%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={chart.width} height={chart.height} rx="8" fill="url(#penalty-zone)" />
        {[0.25, 0.5, 0.75].map(line => (
          <line key={line} x1="28" x2={chart.width - 28} y1={chart.height * line} y2={chart.height * line} stroke="#ffffff" strokeWidth="2" opacity="0.75" />
        ))}
        <path d={chart.path} fill="none" stroke="url(#penalty-line)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {points.slice(-1).map(point => (
          <g key={`${point.timeMs}-${point.penalty}`}>
            <circle cx={chart.width - 28} cy={chart.height - 28 - ((point.penalty - chart.minPenalty) / Math.max(1, chart.maxPenalty - chart.minPenalty)) * (chart.height - 56)} r="6" fill="#0f172a" />
          </g>
        ))}
      </svg>
    </div>
  );
};

const GenerationShowcaseModal: React.FC = () => {
  const { schedulingShowcase, requestSchedulingStop, dismissSchedulingShowcase } = useStore();
  if (!schedulingShowcase?.isOpen) return null;

  const current = schedulingShowcase.current;
  const isFinished = schedulingShowcase.phase === 'completed' || schedulingShowcase.phase === 'cancelled' || schedulingShowcase.phase === 'failed';
  const readiness = Math.round(current?.readiness || 0);
  const phaseLabel = schedulingShowcase.phase === 'preparing' ? 'Подготовка'
    : schedulingShowcase.phase === 'placing' ? 'Расстановка'
      : schedulingShowcase.phase === 'refining' || schedulingShowcase.phase === 'annealing' ? 'Оптимизация'
        : schedulingShowcase.phase === 'stopping' ? 'Забираю результат'
          : isFinished ? 'Триаж'
            : 'Генерация';

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/70 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-7xl flex-col p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-slate-50 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-600 p-2 text-white">
                <CogIcon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Живая генерация расписания</h2>
                <p className="text-sm text-slate-500">{phaseLabel} · {current ? formatTime(current.timeMs) : '0:00'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isFinished && (
                <button
                  onClick={requestSchedulingStop}
                  disabled={!schedulingShowcase.canTakeCurrentResult || schedulingShowcase.stopRequested}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {schedulingShowcase.stopRequested ? 'Забираю...' : 'Прервать и забрать текущий результат'}
                </button>
              )}
              {isFinished && (
                <button onClick={dismissSchedulingShowcase} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Закрыть
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-6">
            <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Готовность</p>
                <p className={`mt-2 text-4xl font-bold ${readiness >= 98 ? 'text-emerald-600' : readiness >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{readiness}%</p>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, readiness)}%` }} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Штрафы</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{formatPenalty(current?.penalty)}</p>
                <p className="mt-1 text-xs text-slate-500">Жёстких: {current?.hardViolations || 0}, мягких: {formatPenalty(current?.softPenalty)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Поставлено</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{current?.placed || 0}</p>
                <p className="mt-1 text-xs text-slate-500">Обработано {current?.processed || 0} из {current?.total || 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Не распределено</p>
                <p className="mt-2 text-3xl font-bold text-red-600">{schedulingShowcase.failedEntries.length}</p>
                <p className="mt-1 text-xs text-slate-500">Можно разобрать в триаже ниже</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_0.8fr]">
              <PenaltyChart points={schedulingShowcase.history} />
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  {readiness >= 98 ? <CheckCircleIcon className="h-5 w-5 text-emerald-600" /> : <AlertIcon className="h-5 w-5 text-amber-600" />}
                  <h3 className="font-semibold text-slate-900">На человеческом языке</h3>
                </div>
                <p className="text-sm leading-6 text-slate-700">{schedulingShowcase.humanSummary}</p>
                {current?.label && <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{current.label}</p>}
              </div>
            </div>

            {isFinished && (
              <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-bold text-slate-900">Дашборд триажа: кто сломал расписание</h3>
                </div>
                {schedulingShowcase.triage.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {schedulingShowcase.triage.map(item => (
                      <div key={item.id} className={`rounded-lg border p-4 ${item.severity === 'critical' ? 'border-red-200 bg-red-50' : item.severity === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-semibold text-slate-900">{item.title}</h4>
                            <p className="mt-1 text-sm text-slate-700">{item.detail}</p>
                          </div>
                          <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">{item.count}</span>
                        </div>
                        {item.actionHint && <p className="mt-3 rounded-md bg-white/80 px-3 py-2 text-sm text-slate-700">{item.actionHint}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">Жёстких виновников не осталось. Если качество всё ещё не идеально, смотрите мягкие штрафы: окна, перегрузки и непохожесть недель.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenerationShowcaseModal;
