import { usePredictionSummary } from '../hooks/usePredictionSummary';

interface RecommendationPanelProps {
  onApply: (resources: { ac: number; al: number; asr: number; personnel: number }) => void;
}

const RSK_50_FLOW = 3.5; // л/с — расход ствола РСК-50

export default function RecommendationPanel({ onApply }: RecommendationPanelProps) {
  const summary = usePredictionSummary();

  if (!summary.hasData) {
    return (
      <div className="p-4 text-xs text-gray-400 text-center">
        <div className="text-3xl mb-2">💡</div>
        <p className="mb-2">Нет прогноза</p>
        <p className="text-[10px] leading-relaxed">
          Пройдите этапы на странице{' '}
          <span className="text-emerald-400">📊 Прогнозирование</span>, чтобы увидеть рекомендации модели.
        </p>
      </div>
    );
  }

  const stvols = summary.recommendedStvols ?? 0;

  // Расчёт рекомендуемой техники на основе стволов
  // По боевому уставу: ~2 ствола РСК-50 на один АЦ-40
  const recommendedAc = stvols > 0 ? Math.ceil(stvols / 2) : 0;

  // Личный состав: 3 чел. на ствол (ствольщик + подствольщик + на разветвлении) + резерв
  const recommendedPersonnel = stvols > 0 ? stvols * 3 + 3 : 0;

  // Фактические данные (что ввёл пользователь)
  const actualAc = summary.actualMainVehicles;
  const actualSpecial = summary.actualSpecialVehicles;
  const actualTrains = summary.actualFireTrains;

  // --- Итерация 7: АСО ---
  const asoRecommended = summary.needsAso ? 1 : 0;

  const totalFlow = stvols * RSK_50_FLOW;

  const formatTime = (v: number | null): string => (v === null ? '—' : `${v.toFixed(2)} мин`);

  return (
    <div className="p-3 space-y-3">
      <div>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">
          💡 Рекомендации модели
        </h3>
        <div className="text-[10px] text-emerald-400 bg-emerald-900/20 rounded px-2 py-1 mb-2">
          Источник: {summary.stageLabel}
        </div>
      </div>

      {(summary.workDate || summary.workTime) && (
        <div className="bg-sky-900/20 border border-sky-500/30 rounded-lg p-2.5">
          <div className="text-[10px] text-sky-400 font-semibold mb-1">🕐 Условия работ</div>
          <div className="space-y-1 text-[11px]">
            {summary.seasonName && (
              <div className="flex justify-between">
                <span className="text-gray-300">Сезон:</span>
                <span className="text-sky-200">{summary.seasonName}</span>
              </div>
            )}
            {summary.workDate && summary.workTime && (
              <div className="flex justify-between">
                <span className="text-gray-300">Начало:</span>
                <span className="font-mono text-sky-200">{summary.workTime}</span>
              </div>
            )}
            {summary.sunsetTime && (
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Закат ≈</span>
                <span className="font-mono text-gray-400">{summary.sunsetTime}</span>
              </div>
            )}
            {summary.sunriseTime && (
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Рассвет ≈</span>
                <span className="font-mono text-gray-400">{summary.sunriseTime}</span>
              </div>
            )}
            <div className={`mt-1 pt-1 border-t border-sky-700/30 text-[10px] ${
              summary.needsAso ? 'text-amber-300' : 'text-emerald-300'
            }`}>
              {summary.needsAso
                ? `💡 Нужен АСО — ${summary.asoReason.toLowerCase()}`
                : `☀️ АСО не требуется — ${summary.asoReason.toLowerCase()}`}
            </div>
          </div>
        </div>
      )}

      {stvols > 0 && (
        <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-2.5">
          <div className="text-[10px] text-orange-400 font-semibold mb-1">🎯 Силы и средства</div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-300">⭐ Стволов (РСК-50):</span>
              <span className="font-mono font-bold text-orange-200">{stvols}</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 pl-3">
              <span>≈ расход воды:</span>
              <span className="font-mono">{totalFlow.toFixed(1)} л/с</span>
            </div>
            <div className="border-t border-orange-700/30 mt-1 pt-1">
              <div className="text-[9px] text-orange-300/70 mb-1">Расчёт по стволам:</div>
              <div className="flex justify-between">
                <span className="text-gray-300">АЦ-40:</span>
                <span className="font-mono text-orange-200">≈ {recommendedAc}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Л/с (расчёт):</span>
                <span className="font-mono text-orange-200">≈ {recommendedPersonnel}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {(actualAc > 0 || actualSpecial > 0 || actualTrains > 0) && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-2.5">
          <div className="text-[10px] text-blue-400 font-semibold mb-1">📋 Заявлено РТП</div>
          <div className="space-y-1 text-[11px]">
            {actualAc > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-300">АЦ:</span>
                <span className="font-mono text-blue-200">{actualAc}</span>
              </div>
            )}
            {actualSpecial > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-300">Спец. ПА (АСА/АСО):</span>
                <span className="font-mono text-blue-200">{actualSpecial}</span>
              </div>
            )}
            {actualTrains > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-300">Пожарных поездов:</span>
                <span className="font-mono text-blue-200">{actualTrains}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {(summary.forecastLocalization !== null ||
        summary.forecastOpenFlame !== null ||
        summary.forecastConsequences !== null ||
        summary.forecastExtinguishTotal !== null) && (
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-2.5">
          <div className="text-[10px] text-purple-400 font-semibold mb-1">🔮 Прогноз времени</div>
          <div className="space-y-1 text-[11px]">
            {summary.forecastLocalization !== null && (
              <div className="flex justify-between">
                <span className="text-gray-300">Локализация:</span>
                <span className="font-mono text-purple-200">{formatTime(summary.forecastLocalization)}</span>
              </div>
            )}
            {summary.forecastOpenFlame !== null && (
              <div className="flex justify-between">
                <span className="text-gray-300">Ликв. горения:</span>
                <span className="font-mono text-purple-200">{formatTime(summary.forecastOpenFlame)}</span>
              </div>
            )}
            {summary.forecastConsequences !== null && (
              <div className="flex justify-between">
                <span className="text-gray-300">Ликв. последствий:</span>
                <span className="font-mono text-purple-200">{formatTime(summary.forecastConsequences)}</span>
              </div>
            )}
            {summary.forecastExtinguishTotal !== null && (
              <div className="flex justify-between border-t border-purple-700/40 pt-1 mt-1">
                <span className="text-purple-300 font-semibold">Итого тушение:</span>
                <span className="font-mono font-bold text-purple-200">{formatTime(summary.forecastExtinguishTotal)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {stvols > 0 && (
        <button
          onClick={() => onApply({
            ac: recommendedAc,
            al: actualSpecial > 0 ? actualSpecial : 0,
            asr: asoRecommended,
            personnel: recommendedPersonnel,
          })}
          className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-xs font-semibold"
        >
          ⚡ Заполнить рекомендациями
        </button>
      )}

      <p className="text-[9px] text-gray-500 leading-tight">
        Нажмите «Заполнить», затем «🚀 Расставить» — карта построит расстановку с рекомендованными силами.
      </p>
    </div>
  );
}
