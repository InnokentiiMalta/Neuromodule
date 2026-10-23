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
  showForces?: boolean;
  customTimeFields?: Array<{
    key: string;
    label: string;
    value: number;
    onChange: (v: number) => void;
  }>;
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
  showForces = true,
  customTimeFields,
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

      {showForces && (
        <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">АЦ-40 (ед.)</label>
          <input
            type="number"
            min="0"
            value={isFixed && actuals ? actuals.ac : current.ac}
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
            value={isFixed && actuals ? actuals.asa : current.asa}
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
            value={isFixed && actuals ? actuals.aso : current.aso}
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
            value={isFixed && actuals ? actuals.trains : current.trains}
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
            value={isFixed && actuals ? actuals.stvols : current.stvols}
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
            value={isFixed && actuals ? actuals.personnel : current.personnel}
            onChange={(e) => onActualsChange({ ...current, personnel: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
      </div>
      )}

      {customTimeFields ? (
        customTimeFields.map((field) => (
          <div key={field.key} className="mb-3">
            <label className="block text-sm text-gray-300 mb-1">{field.label}</label>
            <input
              type="number"
              min="0"
              value={field.value}
              onChange={(e) => field.onChange(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white disabled:opacity-50"
              disabled={inputsDisabled}
            />
          </div>
        ))
      ) : timeLabel ? (
        <div className="mb-3">
          <label className="block text-sm text-gray-300 mb-1">{timeLabel}</label>
          {timeHint && <p className="text-xs text-gray-500 mb-1">ℹ️ {timeHint}</p>}
          <input
            type="number"
            min="0"
            value={timeValue}
            onChange={(e) => onTimeChange(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
      ) : null}

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
          <div className="text-[10px] text-purple-400 font-semibold mb-2">🎯 Прогноз ML и рекомендации</div>
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-purple-700/40 text-purple-300">
                <th className="pb-1 font-normal">Показатель</th>
                <th className="pb-1 text-center font-normal">Прогноз ML</th>
                <th className="pb-1 text-right font-normal">Факт</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {forecastTime !== null && forecastTime !== undefined && (
                <tr>
                  <td className="py-1">Время этапа</td>
                  <td className="text-center font-mono text-purple-200">{forecastTime.toFixed(1)} мин</td>
                  <td className="text-right font-mono text-emerald-200">{timeValue > 0 ? `${timeValue} мин` : '—'}</td>
                </tr>
              )}
              {forecastForce !== null && (
                <tr>
                  <td className="py-1">Стволов</td>
                  <td className="text-center font-mono text-purple-200">{forecastForce} шт.</td>
                  <td className="text-right font-mono text-emerald-200">{current.stvols > 0 ? `${current.stvols} шт.` : '—'}</td>
                </tr>
              )}
            </tbody>
          </table>
          {forecastForce !== null && (
            <div className="mt-2 pt-2 border-t border-purple-700/40 text-[10px] text-emerald-300">
              ✅ Для перехода на следующий этап необходимо: {forecastForce} ств., и желательно {(current.ac + current.asa) > 0 ? (current.ac + current.asa) : 1} АЦ.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
