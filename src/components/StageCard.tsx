import { StageActuals } from '../pages/PredictionPage';
import { useState } from 'react';
import { UNIT_LIMITS, clampUnitCount } from '../utils/crew';

const STAGE_TITLES = ['Прибытие 1 РТП', 'Локализация', 'Ликвидация открытого горения', 'Полная ликвидация'];

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
  forecastAc?: number | null;
  forecastAso?: number | null;
  forecastAsa?: number | null;
  forecastTrains?: number | null;
  forecastPersonnel?: number | null;
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
  onPlaceForces?: () => void;
  onPlaceActuals?: () => void;
  onRollback?: (stageIndex: number) => void;
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
  forecastAc,
  forecastAso,
  forecastAsa,
  forecastTrains,
  forecastPersonnel,
  onActualsChange,
  onTimeChange,
  onFix,
  loading,
  showForces = true,
  customTimeFields,
  onPlaceForces,
  onPlaceActuals,
  onRollback,
}: StageCardProps) {
  const isLocked = state === 'locked';
  const isFixed = state === 'fixed';
  const isActive = state === 'active';
  const inputsDisabled = isLocked || isFixed || loading;

  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [confirmRollback, setConfirmRollback] = useState(false);

  const applyCount = (
    key: 'ac' | 'asa' | 'aso' | 'train',
    field: 'ac' | 'asa' | 'aso' | 'trains',
    label: string,
    raw: string
  ) => {
    const num = Math.floor(Number(raw) || 0);
    const max = UNIT_LIMITS[key];
    setLimitMsg(num > max ? `${label}: максимум ${max} ед. Значение ограничено до ${max}.` : null);
    onActualsChange({ ...current, [field]: clampUnitCount(key, num) });
  };

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

      {isFixed && onRollback && (
        <div className="mb-3">
          {!confirmRollback ? (
            <button
              onClick={() => setConfirmRollback(true)}
              className="w-full px-3 py-1.5 text-[11px] bg-amber-700/40 hover:bg-amber-600/60 border border-amber-600/50 text-amber-200 rounded"
            >
              ✏️ Корректировать этот этап
            </button>
          ) : (
            <div className="p-2.5 rounded border border-amber-500/60 bg-amber-900/25">
              <p className="text-[11px] text-amber-200 font-semibold mb-1">⚠️ Откат к этому этапу</p>
              <p className="text-[10px] text-amber-100/90 mb-2">
                Будут сброшены все введённые и зафиксированные данные этого и последующих этапов:{' '}
                <span className="font-semibold">{STAGE_TITLES.slice(stageIndex).join(', ')}</span>.
                Расстановка техники, поездов и людей на карте будет очищена, площадь пожара пересчитается. Отменить это действие нельзя.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmRollback(false); onRollback(stageIndex); }}
                  className="flex-1 px-3 py-1.5 text-[11px] bg-red-700 hover:bg-red-600 rounded font-semibold"
                >
                  Сбросить и корректировать
                </button>
                <button
                  onClick={() => setConfirmRollback(false)}
                  className="px-3 py-1.5 text-[11px] bg-gray-700 hover:bg-gray-600 rounded"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showForces && (
        <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">АЦ-40 (ед., ≤{UNIT_LIMITS.ac})</label>
          <input
            type="number"
            min="0"
            max={UNIT_LIMITS.ac}
            value={isFixed && actuals ? actuals.ac : current.ac}
            onChange={(e) => applyCount('ac', 'ac', 'АЦ-40', e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">АСА (ед., ≤{UNIT_LIMITS.asa})</label>
          <input
            type="number"
            min="0"
            max={UNIT_LIMITS.asa}
            value={isFixed && actuals ? actuals.asa : current.asa}
            onChange={(e) => applyCount('asa', 'asa', 'АСА', e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">АСО (ед., ≤{UNIT_LIMITS.aso})</label>
          <input
            type="number"
            min="0"
            max={UNIT_LIMITS.aso}
            value={isFixed && actuals ? actuals.aso : current.aso}
            onChange={(e) => applyCount('aso', 'aso', 'АСО', e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
            disabled={inputsDisabled}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Пожарных поездов (ед., ≤{UNIT_LIMITS.train})</label>
          <input
            type="number"
            min="0"
            max={UNIT_LIMITS.train}
            value={isFixed && actuals ? actuals.trains : current.trains}
            onChange={(e) => applyCount('train', 'trains', 'Пожарных поездов', e.target.value)}
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
        {limitMsg && (
          <div className="col-span-3 text-[10px] text-amber-300 bg-amber-900/30 border border-amber-600/40 rounded px-2 py-1">
            ⚠️ {limitMsg}
          </div>
        )}
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
          <div className="text-[10px] text-purple-400 font-semibold mb-2">
            🎯 Прогноз ML <span className="text-purple-300/70 font-normal">(прогноз / рекомендация)</span>
          </div>
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-purple-700/40 text-purple-300">
                <th className="pb-1 font-normal">Показатель</th>
                <th className="pb-1 text-center font-normal">Прогноз ML</th>
                <th className="pb-1 text-right font-normal">Факт</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {forecastTime != null && (
                <tr>
                  <td className="py-1">Время этапа</td>
                  <td className="text-center font-mono text-purple-200">{forecastTime.toFixed(1)} мин</td>
                  <td className="text-right font-mono text-emerald-200">{timeValue > 0 ? `${timeValue} мин` : '—'}</td>
                </tr>
              )}
              {forecastForce != null && (
                <tr>
                  <td className="py-1">Стволов</td>
                  <td className="text-center font-mono text-purple-200">{forecastForce} шт.</td>
                  <td className="text-right font-mono text-emerald-200">{actuals && actuals.stvols > 0 ? `${actuals.stvols} шт.` : '—'}</td>
                </tr>
              )}
              <tr>
                <td className="py-1">Количество АЦ</td>
                <td className="text-center font-mono text-purple-200">{forecastAc != null ? `${forecastAc} ед.` : '—'}</td>
                <td className="text-right font-mono text-emerald-200">{actuals && actuals.ac > 0 ? `${actuals.ac} ед.` : '—'}</td>
              </tr>
              <tr>
                <td className="py-1">Количество АСО</td>
                <td className="text-center font-mono text-purple-200">{forecastAso != null ? `${forecastAso} ед.` : '—'}</td>
                <td className="text-right font-mono text-emerald-200">{actuals && actuals.aso > 0 ? `${actuals.aso} ед.` : '—'}</td>
              </tr>
              <tr>
                <td className="py-1">Количество АСА</td>
                <td className="text-center font-mono text-purple-200">{forecastAsa != null ? `${forecastAsa} ед.` : '—'}</td>
                <td className="text-right font-mono text-emerald-200">{actuals && actuals.asa > 0 ? `${actuals.asa} ед.` : '—'}</td>
              </tr>
              <tr>
                <td className="py-1">Пожарный поезд</td>
                <td className="text-center font-mono text-purple-200">{forecastTrains != null ? `${forecastTrains} ед.` : '—'}</td>
                <td className="text-right font-mono text-emerald-200">{actuals && actuals.trains > 0 ? `${actuals.trains} ед.` : '—'}</td>
              </tr>
              <tr>
                <td className="py-1">Количество людей</td>
                <td className="text-center font-mono text-purple-200">{forecastPersonnel != null ? `${forecastPersonnel} чел.` : '—'}</td>
                <td className="text-right font-mono text-emerald-200">{actuals && actuals.personnel > 0 ? `${actuals.personnel} чел.` : '—'}</td>
              </tr>
            </tbody>
          </table>
          {forecastForce != null && (
            <div className="mt-2 pt-2 border-t border-purple-700/40 text-[10px] text-emerald-300">
              💡 На текущий момент рекомендуется не меньше {forecastForce} стволов.
            </div>
          )}
          {onPlaceForces && (
            <button
              onClick={onPlaceForces}
              className="mt-3 w-full py-2 bg-purple-700 hover:bg-purple-600 rounded font-semibold text-xs text-white"
            >
              📍 Расставить рекомендованные силы
            </button>
          )}
          {onPlaceActuals && (
            <button
              onClick={onPlaceActuals}
              className="mt-2 w-full py-2 bg-emerald-700 hover:bg-emerald-600 rounded font-semibold text-xs text-white"
            >
              📍 Расставить фактические силы
            </button>
          )}
        </div>
      )}
    </div>
  );
}
