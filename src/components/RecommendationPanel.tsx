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
  const ac = summary.recommendedMainVehicles ?? 0;
  const special = summary.recommendedSpecialVehicles ?? 0;
  const trains = summary.recommendedFireTrains ?? 0;
  // Разложение специальных ПА: АСО при тёмном времени (пока без даты — весь в АСА)
  // TODO: учесть дату/время в итерации 7
  const asa = special;
  const aso = 0;
  const totalFlow = stvols * RSK_50_FLOW;
  // Л/с: 3 человека на ствол (ствольщик + подствольщик + на разветвлении)
  const personnel = stvols * 3 + ac + asa + aso;

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

      {stvols > 0 && (
        <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-2.5">
          <div className="text-[10px] text-orange-400 font-semibold mb-1">🎯 Силы и средства</div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-300">Стволов (РСК-50):</span>
              <span className="font-mono font-bold text-orange-200">{stvols}</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 pl-3">
              <span>≈ расход воды:</span>
              <span className="font-mono">{totalFlow.toFixed(1)} л/с</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Основных ПА (АЦ):</span>
              <span className="font-mono text-orange-200">{ac}</span>
            </div>
            {asa > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-300">АСА:</span>
                <span className="font-mono text-orange-200">{asa}</span>
              </div>
            )}
            {aso > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-300">АСО:</span>
                <span className="font-mono text-orange-200">{aso}</span>
              </div>
            )}
            {trains > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-300">Пожарных поездов:</span>
                <span className="font-mono text-orange-200">{trains}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-orange-700/30 pt-1 mt-1">
              <span className="text-gray-300">Л/с (оценка):</span>
              <span className="font-mono text-orange-200">{personnel}</span>
            </div>
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
          onClick={() => onApply({ ac, al: asa, asr: aso, personnel })}
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
