import { StageActuals } from '../pages/PredictionPage';

interface StageCardProps {
  stageIndex: number;
  stageLabel: string;
  timeLabel?: string;
  timeHint?: string;
  state: 'locked' | 'active' | 'fixed';
  actuals: StageActuals | null;
  current: StageActuals;
  timeValue: number;
  forecastForce?: number | null;
  forecastTime?: number | null;
  onActualsChange: (a: StageActuals) => void;
  onTimeChange: (v: number) => void;
  onFix: () => void;
  loading?: boolean;
}

export default function StageCard({
  stageIndex,
  stageLabel,
  timeLabel,
  timeHint,
  state,
  actuals,
  current,
  timeValue,
  forecastForce,
  forecastTime,
  onActualsChange,
  onTimeChange,
  onFix,
  loading,
}: StageCardProps) {
  const isLocked = state === 'locked';
  const isFixed = state === 'fixed';
  const isActive = state === 'active';
  const inputsDisabled = isLocked || isFixed || loading;

  const statusBadge =
    isLocked ? (
      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-400">🔒 Заблокировано</span>
    ) : isFixed ? (
      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300">✅ Зафиксировано</span>
    ) : (
      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/60 text-blue-300">🟢 Активно</span>
    );

  const hasForecast =
    (forecastForce !== null && forecastForce !== undefined) ||
    (forecastTime !== null && forecastTime !== undefined);

  return (
    <div className={`rounded-lg p-4 mb-3 border ${
      isLocked ? 'bg-gray-800/50 border-gray-700/50' :
      isFixed ? 'bg-gray-800 border-emerald-700/50' :
      'bg-gray-800 border-blue-700/50'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{stageLabel}</h2>
        {statusBadge}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">АЦ-40 (ед.)</label>
          <input
            type="number"
            min="0"
            value={current.ac}
            onChange={(e) => onActualsChange({ ...current, ac: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">АСА (ед.)</label>
          <input
            type="number"
            min="0"
            value={current.asa}
            onChange={(e) => onActualsChange({ ...current, asa: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">АСО (ед.)</label>
          <input
            type="number"
            min="0"
            value={current.aso}
            onChange={(e) => onActualsChange({ ...current, aso: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Пожарных поездов (ед.)</label>
          <input
            type="number"
            min="0"
            value={current.trains}
            onChange={(e) => onActualsChange({ ...current, trains: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Стволов (ед.)</label>
          <input
            type="number"
            min="0"
            value={current.stvols}
            onChange={(e) => onActualsChange({ ...current, stvols: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Л/С всего (чел.)</label>
          <input
            type="number"
            min="0"
            value={current.personnel}
            onChange={(e) => onActualsChange({ ...current, personnel: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
      </div>

      {timeLabel && (
        <div className="mb-3">
          <label className="block text-sm text-gray-300 mb-1">{timeLabel}</label>
          {timeHint && (
            <p className="text-xs text-gray-500 mb-1">ℹ️ {timeHint}</p>
          )}
          <input
            type="number"
            min="0"
            value={timeValue}
            onChange={(e) => onTimeChange(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
      )}

      {isActive && (
        <button
          onClick={onFix}
          disabled={loading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded font-semibold text-sm"
        >
          ✓ Зафиксировать этап
        </button>
      )}

      {isFixed && hasForecast && (
        <div className="mt-3 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
          <div className="text-[10px] text-purple-400 font-semibold mb-1">🎯 Рекомендация ML на следующий этап</div>
          <div className="space-y-1 text-xs text-gray-300">
            {forecastForce !== null && forecastForce !== undefined && (
              <div className="flex justify-between">
                <span>Стволов:</span>
                <span className="font-mono text-purple-200">{forecastForce}</span>
              </div>
            )}
            {forecastTime !== null && forecastTime !== undefined && (
              <div className="flex justify-between">
                <span>Время:</span>
                <span className="font-mono text-purple-200">{forecastTime.toFixed(1)} мин</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
