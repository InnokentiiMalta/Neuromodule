import { usePredictionSummary } from '../hooks/usePredictionSummary';

interface RecommendationPanelProps {
  onApply: (resources: { ac: number; al: number; asr: number; personnel: number }) => void;
  resources: { ac: number; al: number; asr: number; personnel: number };
}

const RSK_50_FLOW = 3.5; // л/с — расход ствола РСК-50

export default function RecommendationPanel({ onApply, resources }: RecommendationPanelProps) {
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
  const recommendedPersonnel = stvols;

  // Фактические данные (что ввёл пользователь)
  const actualAc = summary.actualMainVehicles;
  const actualSpecial = summary.actualSpecialVehicles;
  const actualTrains = summary.actualFireTrains;
  const actualStvols = summary.initialParams['Всего_подано_пожарных_стволов_ед'] ?? 0;
  const factLocalization = summary.additionalParams['Время_локализации_пожара_мин'] ?? 0;
  const factOpenFlame = summary.additionalParams['Время_ликвидации_открытого_горения_мин'] ?? 0;
  const factConsequences = summary.additionalParams['Время_ликвидации_последствий_пожара_мин'] ?? 0;
  const factExtinguishTotal = factLocalization + factOpenFlame + factConsequences;

  const renderCompare = (forecast: number | null, fact: number, unit: string = 'мин') => {
    if (forecast === null || fact <= 0) {
      return <span className="font-mono text-purple-200">{forecast !== null ? `${forecast.toFixed(1)} ${unit}` : '—'}</span>;
    }
    const diff = fact - forecast;
    const faster = diff < 0;
    const color = Math.abs(diff) < 0.5 ? 'text-gray-300' : (faster ? 'text-emerald-300' : 'text-amber-300');
    const label = Math.abs(diff) < 0.5
      ? 'соответствует прогнозу'
      : (faster ? `быстрее на ${Math.abs(diff).toFixed(1)} мин` : `медленнее на ${diff.toFixed(1)} мин`);
    return (
      <span className="flex flex-col items-end leading-tight">
        <span className="font-mono text-purple-200">{forecast.toFixed(1)} → {fact.toFixed(1)}</span>
        <span className={`text-[9px] ${color}`}>{label}</span>
      </span>
    );
  };

  const forecastExtinguishTotalFull =
    (summary.forecastLocalization ?? 0) +
    (summary.forecastOpenFlame ?? 0) +
    (summary.forecastConsequences ?? 0);

  // --- Итерация 7: АСО ---
  const asoRecommended = summary.needsAso ? 1 : 0;

  const totalFlow = stvols * RSK_50_FLOW;

  const formatTime = (v: number | null): string => (v === null ? '—' : `${v.toFixed(2)} мин`);

  return (
    <div className="p-3 space-y-3">
      {/* Заголовок на всю ширину */}
      <div>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">
          💡 Рекомендации модели
        </h3>
        <div className="text-[10px] text-emerald-400 bg-emerald-900/20 rounded px-2 py-1">
          Источник: {summary.stageLabel}
        </div>
      </div>

      {/* Основные блоки — в 2 колонки */}
      <div className="grid grid-cols-2 gap-3">
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

      {/* Фактически на пожаре */}
      <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-2.5">
        <div className="text-[10px] text-emerald-400 font-semibold mb-1">🚒 Фактически на пожаре</div>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-gray-300">Основных ПА (АЦ-40):</span>
            <span className="font-mono text-emerald-200">{resources.ac}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">Специальных ПА (АСА):</span>
            <span className="font-mono text-emerald-200">{resources.al}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">АСО:</span>
            <span className="font-mono text-emerald-200">{resources.asr}</span>
          </div>
          <div className="flex justify-between border-t border-emerald-700/30 pt-1 mt-1">
            <span className="text-gray-300">Л/с (чел.):</span>
            <span className="font-mono text-emerald-200">{resources.personnel}</span>
          </div>
        </div>
      </div>

      {/* Необходимо на текущий момент */}
      {stvols > 0 && (
        <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-2.5">
          <div className="text-[10px] text-orange-400 font-semibold mb-1">🎯 Необходимо на текущий момент</div>
          <div className="text-[9px] text-orange-300/70 mb-1">Рекомендация ML на этапе «{summary.stageLabel}»</div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-300">⭐ Стволов (РСК-50):</span>
              <span className="font-mono font-bold text-orange-200">{stvols}</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 pl-3">
              <span>≈ расход воды:</span>
              <span className="font-mono">{totalFlow.toFixed(1)} л/с</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">АЦ-40:</span>
              <span className="font-mono text-orange-200">≈ {recommendedAc}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Л/с (расчёт):</span>
              <span className="font-mono text-orange-200">≈ {recommendedPersonnel}</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-orange-700/30 text-[10px]">
            {(() => {
              const acShortage = recommendedAc - resources.ac;
              const stvolsShortage = stvols - (resources.ac * 2);
              const acSurplus = resources.ac - recommendedAc;
              if (acShortage > 0 || stvolsShortage > 0) {
                const parts: string[] = [];
                if (acShortage > 0) parts.push(`АЦ-40: +${acShortage}`);
                if (stvolsShortage > 0) parts.push(`стволов: +${stvolsShortage}`);
                return <div className="text-amber-300">⚠️ Не хватает: {parts.join(', ')}</div>;
              }
              if (acSurplus > 0) {
                return <div className="text-emerald-300">✅ Сил достаточно. {acSurplus} АЦ можно в резерв</div>;
              }
              return <div className="text-emerald-300">✅ Сил достаточно</div>;
            })()}
          </div>
        </div>
      )}

      {/* Прогноз к следующему этапу */}
      {stvols > 0 && summary.stage < 4 && (
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-2.5">
          <div className="text-[10px] text-purple-400 font-semibold mb-1">🔮 Прогноз к следующему этапу</div>
          <div className="text-[9px] text-purple-300/70 mb-1">
            Ориентир по текущей рекомендации. Будет актуализирован после следующего этапа.
          </div>
          <div className="space-y-1 text-[10px] text-gray-300">
            <div className="flex justify-between">
              <span>Ориентир по стволам:</span>
              <span className="font-mono text-purple-200">{stvols}</span>
            </div>
            <div className="flex justify-between">
              <span>Ориентир по АЦ-40:</span>
              <span className="font-mono text-purple-200">{Math.ceil(stvols / 2)}</span>
            </div>
          </div>
          {resources.ac >= Math.ceil(stvols / 2) && (
            <div className="mt-2 pt-2 border-t border-purple-700/30 text-[10px] text-emerald-300">
              ✅ Сил достаточно на весь пожар
            </div>
          )}
          {resources.ac < Math.ceil(stvols / 2) && (
            <div className="mt-2 pt-2 border-t border-purple-700/30 text-[10px] text-amber-300">
              ⚠️ Рекомендуется вызвать ещё {Math.ceil(stvols / 2) - resources.ac} АЦ-40
            </div>
          )}
        </div>
      )}

      {stvols > 0 && summary.stage === 4 && (
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-2.5">
          <div className="text-[10px] text-purple-400 font-semibold mb-1">🔮 Прогноз</div>
          <div className="text-[10px] text-emerald-300">
            ✅ Все этапы пройдены. Тушение завершено.
          </div>
        </div>
      )}

      {(summary.forecastLocalization !== null ||
        summary.forecastOpenFlame !== null ||
        summary.forecastConsequences !== null ||
        summary.forecastExtinguishTotal !== null) && (
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-2.5">
          <div className="text-[10px] text-purple-400 font-semibold mb-1">🔮 Прогноз времени</div>
          <div className="text-[9px] text-purple-300/70 mb-1">прогноз → факт</div>
          <div className="space-y-1 text-[11px]">
            {summary.forecastLocalization !== null && (
              <div className="flex justify-between items-start">
                <span className="text-gray-300">Локализация:</span>
                {renderCompare(summary.forecastLocalization, factLocalization)}
              </div>
            )}
            {summary.forecastOpenFlame !== null && (
              <div className="flex justify-between items-start">
                <span className="text-gray-300">Ликв. горения:</span>
                {renderCompare(summary.forecastOpenFlame, factOpenFlame)}
              </div>
            )}
            {summary.forecastConsequences !== null && (
              <div className="flex justify-between items-start">
                <span className="text-gray-300">Ликв. последствий:</span>
                {renderCompare(summary.forecastConsequences, factConsequences)}
              </div>
            )}
            {(summary.forecastLocalization !== null || summary.forecastOpenFlame !== null || summary.forecastConsequences !== null) && (
              <div className="flex justify-between items-start border-t border-purple-700/40 pt-1 mt-1">
                <span className="text-purple-300 font-semibold">Итого тушение:</span>
                {renderCompare(forecastExtinguishTotalFull, factExtinguishTotal)}
              </div>
            )}
          </div>
        </div>
      )}

      {(actualAc > 0 || actualSpecial > 0 || actualTrains > 0 || actualStvols > 0) && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-2.5">
          <div className="text-[10px] text-blue-400 font-semibold mb-1">📋 Заявлено РТП для прогноза параметров</div>
          <div className="space-y-1 text-[11px]">
            {actualStvols > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-300">Стволов (РСК-50):</span>
                <span className="font-mono text-blue-200">{actualStvols}</span>
              </div>
            )}
            {actualStvols > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-300">Л/с (по стволам):</span>
                <span className="font-mono text-blue-200">{actualStvols}</span>
              </div>
            )}
            {actualAc > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-300">Основных ПА (АЦ-40):</span>
                <span className="font-mono text-blue-200">{actualAc}</span>
              </div>
            )}
            {actualSpecial > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-300">Специальных ПА:</span>
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

          {/* Сравнение с рекомендацией ML */}
          {stvols > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-700/40 space-y-0.5 text-[10px]">
              {(() => {
                const recAc = Math.ceil(stvols / 2);
                const issues: string[] = [];
                if (actualStvols < stvols) issues.push(`стволов: +${stvols - actualStvols}`);
                if (actualAc < recAc) issues.push(`АЦ-40: +${recAc - actualAc}`);
                if (issues.length === 0) {
                  return (
                    <div className="text-emerald-300 flex items-center gap-1">
                      ✅ Сил и средств по прогнозу достаточно
                    </div>
                  );
                }
                return (
                  <div className="text-amber-300">
                    ⚠️ Не хватает: {issues.join(', ')}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
      </div>

      {/* Кнопка и подсказка — на всю ширину */}
      <div className="space-y-2">
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
    </div>
  );
}
