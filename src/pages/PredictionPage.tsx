import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { predictStage, sendFinalData, getDataStatus } from '../api/backend';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

interface InitialParams {
  Время_следования_мин: number;
  Время_подачи_первого_ствола_мин: number;
  Количество_основных_пожарных_автомобилей_ед: number;
  Количество_специальных_пожарных_автомобилей_ед: number;
  Количество_пожарных_поездов_ед: number;
  Всего_подано_пожарных_стволов_ед: number;
}

interface AdditionalParams {
  Время_локализации_пожара_мин: number;
  Время_ликвидации_открытого_горения_мин: number;
  Время_ликвидации_последствий_пожара_мин: number;
}

const INITIAL_FIELDS = [
  { key: 'Время_следования_мин', label: 'Время следования (мин)', default: 8 },
  { key: 'Время_подачи_первого_ствола_мин', label: 'Время подачи первого ствола (мин)', default: 1 },
  { key: 'Количество_основных_пожарных_автомобилей_ед', label: 'Основных ПА', default: 2 },
  { key: 'Количество_специальных_пожарных_автомобилей_ед', label: 'Специальных ПА', default: 0 },
  { key: 'Количество_пожарных_поездов_ед', label: 'Пожарных поездов', default: 0 },
  { key: 'Всего_подано_пожарных_стволов_ед', label: 'Всего стволов', default: 1 },
];

const ADDITIONAL_FIELDS = [
  { key: 'Время_локализации_пожара_мин', label: 'Время локализации пожара (мин)' },
  { key: 'Время_ликвидации_открытого_горения_мин', label: 'Время ликвидации открытого горения (мин)' },
  { key: 'Время_ликвидации_последствий_пожара_мин', label: 'Время ликвидации последствий (мин)' },
];

const RECOMMENDED_KEYS = new Set([
  'Всего_подано_пожарных_стволов_ед',
  'Количество_основных_пожарных_автомобилей_ед',
  'Количество_специальных_пожарных_автомобилей_ед',
  'Количество_пожарных_поездов_ед',
]);

const FORECAST_KEYS = new Set([
  'Время_локализации_пожара_мин',
  'Время_ликвидации_открытого_горения_мин',
  'Время_ликвидации_последствий_пожара_мин',
  'Время_тушения_мин',
]);

const PARAM_LABELS: Record<string, string> = {
  'Время_локализации_пожара_мин': 'Время локализации пожара',
  'Время_ликвидации_открытого_горения_мин': 'Время ликвидации открытого горения',
  'Время_ликвидации_последствий_пожара_мин': 'Время ликвидации последствий',
  'Время_тушения_мин': 'Общее время тушения',
  'Всего_подано_пожарных_стволов_ед': 'Всего подано стволов',
  'Количество_основных_пожарных_автомобилей_ед': 'Основных ПА',
  'Количество_специальных_пожарных_автомобилей_ед': 'Специальных ПА',
  'Количество_пожарных_поездов_ед': 'Пожарных поездов',
};

const PARAM_ORDER = [
  'Время_локализации_пожара_мин',
  'Время_ликвидации_открытого_горения_мин',
  'Время_ликвидации_последствий_пожара_мин',
  'Время_тушения_мин',
  'Всего_подано_пожарных_стволов_ед',
  'Количество_основных_пожарных_автомобилей_ед',
  'Количество_специальных_пожарных_автомобилей_ед',
  'Количество_пожарных_поездов_ед',
];

export default function PredictionPage() {
  const [initialParams, setInitialParams] = useLocalStorageState<InitialParams>('prediction_initialParams', {
    Время_следования_мин: 8,
    Время_подачи_первого_ствола_мин: 1,
    Количество_основных_пожарных_автомобилей_ед: 2,
    Количество_специальных_пожарных_автомобилей_ед: 0,
    Количество_пожарных_поездов_ед: 0,
    Всего_подано_пожарных_стволов_ед: 1,
  });

  const [additionalParams, setAdditionalParams] = useLocalStorageState<AdditionalParams>('prediction_additionalParams', {
    Время_локализации_пожара_мин: 0,
    Время_ликвидации_открытого_горения_мин: 0,
    Время_ликвидации_последствий_пожара_мин: 0,
  });

  const [currentStage, setCurrentStage] = useLocalStorageState<number>('prediction_currentStage', 0);
  const [stageResults, setStageResults] = useLocalStorageState<(Record<string, unknown> | null)[]>('prediction_stageResults', [null, null, null, null]);
  const [workDate, setWorkDate] = useLocalStorageState<string>('prediction_workDate', '');
  const [workTime, setWorkTime] = useLocalStorageState<string>('prediction_workTime', '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalSubmitted, setFinalSubmitted] = useState(false);
  const [dataStatus, setDataStatus] = useState<{ total_rows: number; new_rows: number; threshold: number } | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      const status = await getDataStatus();
      if (status) setDataStatus(status);
    };
    loadStatus();
  }, [finalSubmitted]);

  const handleInitialChange = (key: keyof InitialParams, value: string) => {
    setInitialParams(prev => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const handleAdditionalChange = (key: keyof AdditionalParams, value: string) => {
    setAdditionalParams(prev => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const buildInputData = (stage: number) => {
    const data: Record<string, number> = { ...initialParams };

    if (stage >= 1) {
      data['Время_локализации_пожара_мин'] = additionalParams['Время_локализации_пожара_мин'];
    }
    if (stage >= 2) {
      data['Время_ликвидации_открытого_горения_мин'] = additionalParams['Время_ликвидации_открытого_горения_мин'];
    }
    if (stage >= 3) {
      data['Время_ликвидации_последствий_пожара_мин'] = additionalParams['Время_ликвидации_последствий_пожара_мин'];
    }

    return data;
  };

  const handlePredict = async (stage: number) => {
    setLoading(true);
    setError(null);
    try {
      const inputData = buildInputData(stage);
      const result = await predictStage(inputData, stage);
      setStageResults(prev => {
        const newResults = [...prev];
        newResults[stage] = result as Record<string, unknown>;
        return newResults;
      });
      setCurrentStage(prev => Math.max(prev, stage + 1));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFinal = async () => {
    setLoading(true);
    setError(null);
    try {
      const finalData: Record<string, number> = {
        ...initialParams,
        'Время_локализации_пожара_мин': additionalParams['Время_локализации_пожара_мин'],
        'Время_ликвидации_открытого_горения_мин': additionalParams['Время_ликвидации_открытого_горения_мин'],
        'Время_ликвидации_последствий_пожара_мин': additionalParams['Время_ликвидации_последствий_пожара_мин'],
      };
      finalData['Время_тушения_мин'] =
        additionalParams['Время_локализации_пожара_мин'] +
        additionalParams['Время_ликвидации_открытого_горения_мин'];

      const result = await sendFinalData(finalData);
      console.log('[submitFinal] Server response:', result);
      setFinalSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleNewFire = () => {
    if (!confirm('Начать новый пожар? Все введённые данные будут удалены.')) return;
    setInitialParams({
      Время_следования_мин: 8,
      Время_подачи_первого_ствола_мин: 1,
      Количество_основных_пожарных_автомобилей_ед: 2,
      Количество_специальных_пожарных_автомобилей_ед: 0,
      Количество_пожарных_поездов_ед: 0,
      Всего_подано_пожарных_стволов_ед: 1,
    });
    setAdditionalParams({
      Время_локализации_пожара_мин: 0,
      Время_ликвидации_открытого_горения_мин: 0,
      Время_ликвидации_последствий_пожара_мин: 0,
    });
    setCurrentStage(0);
    setStageResults([null, null, null, null]);
    setWorkDate('');
    setWorkTime('');
    setFinalSubmitted(false);
    setError(null);
  };

  const formatValue = (v: unknown): string => {
    if (typeof v === 'number') {
      return v.toFixed(2);
    }
    return String(v);
  };

  return (
    <div className="h-screen overflow-y-auto bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-block mb-6 text-blue-400 hover:text-blue-300 text-sm">
          ← Назад к карте
        </Link>

        <h1 className="text-2xl font-bold mb-6">Поэтапное прогнозирование</h1>

        {/* Дата и время работ */}
        <div className="bg-gray-800 rounded-lg p-4 mb-3">
          <h2 className="text-lg font-semibold mb-3">🕐 Дата и время проведения работ</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Дата начала работ</label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Время начала работ</label>
              <input
                type="time"
                value={workTime}
                onChange={(e) => setWorkTime(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                disabled={loading}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Используется для определения сезона и необходимости АСО (автомобиля связи и освещения).
          </p>
        </div>

        {/* Начальные параметры */}
        <div className="bg-gray-800 rounded-lg p-4 mb-3">
          <h2 className="text-lg font-semibold mb-4">Начальные параметры</h2>
          <div className="grid grid-cols-3 gap-3">
            {INITIAL_FIELDS.map(field => (
              <div key={field.key}>
                <label className="block text-sm text-gray-300 mb-1">{field.label}</label>
                <input
                  type="number"
                  value={initialParams[field.key as keyof InitialParams]}
                  onChange={(e) => handleInitialChange(field.key as keyof InitialParams, e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  disabled={loading}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Дополнительные параметры */}
        <div className="bg-gray-800 rounded-lg p-4 mb-3">
          <h2 className="text-lg font-semibold mb-4">Дополнительные параметры</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                {ADDITIONAL_FIELDS[0].label}
              </label>
              <input
                type="number"
                value={additionalParams['Время_локализации_пожара_мин']}
                onChange={(e) => handleAdditionalChange('Время_локализации_пожара_мин', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white disabled:opacity-50"
                disabled={currentStage < 1 || loading}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                {ADDITIONAL_FIELDS[1].label}
              </label>
              <input
                type="number"
                value={additionalParams['Время_ликвидации_открытого_горения_мин']}
                onChange={(e) => handleAdditionalChange('Время_ликвидации_открытого_горения_мин', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white disabled:opacity-50"
                disabled={currentStage < 2 || loading}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                {ADDITIONAL_FIELDS[2].label}
              </label>
              <input
                type="number"
                value={additionalParams['Время_ликвидации_последствий_пожара_мин']}
                onChange={(e) => handleAdditionalChange('Время_ликвидации_последствий_пожара_мин', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white disabled:opacity-50"
                disabled={currentStage < 3 || loading}
              />
            </div>
          </div>
        </div>

        {/* Кнопки этапов */}
        <div className="bg-gray-800 rounded-lg p-4 mb-3">
          <h2 className="text-lg font-semibold mb-4">Этапы прогнозирования</h2>
          <div className="flex gap-3">
            <button
              onClick={() => handlePredict(0)}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded font-semibold text-sm"
            >
              Этап 1
            </button>
            <button
              onClick={() => handlePredict(1)}
              disabled={currentStage < 1 || loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded font-semibold text-sm"
            >
              Этап 2
            </button>
            <button
              onClick={() => handlePredict(2)}
              disabled={currentStage < 2 || loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded font-semibold text-sm"
            >
              Этап 3
            </button>
            <button
              onClick={() => handlePredict(3)}
              disabled={currentStage < 3 || loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded font-semibold text-sm"
            >
              Финальный этап
            </button>
          </div>

          <button
            onClick={handleSubmitFinal}
            disabled={currentStage < 4 || loading || finalSubmitted}
            className="mt-3 w-full py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-600 disabled:opacity-60 rounded font-semibold text-sm"
          >
            {finalSubmitted ? '✓ Результаты сохранены' : '📋 Общие итоговые результаты'}
          </button>

          {dataStatus && (
            <div className="mt-2 text-xs text-gray-400 text-center">
              Накоплено данных: <span className="font-mono text-white">{dataStatus.total_rows}</span> всего,
              <span className={`font-mono ml-1 ${dataStatus.new_rows > 0 ? 'text-yellow-300' : 'text-gray-500'}`}>
                +{dataStatus.new_rows}
              </span> с последнего дообучения.
              Порог авто-дообучения: <span className="font-mono text-white">{dataStatus.threshold}</span>.
            </div>
          )}

          {finalSubmitted && (
            <div className="mt-4 bg-gray-900 rounded-lg p-4 border border-emerald-700/50">
              <h3 className="text-base font-semibold text-emerald-300 mb-2">📊 Итоговая сводка</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Время следования:</span>
                  <span className="font-mono">{initialParams['Время_следования_мин']} мин</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Подача первого ствола:</span>
                  <span className="font-mono">{initialParams['Время_подачи_первого_ствола_мин']} мин</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Локализация пожара:</span>
                  <span className="font-mono">{additionalParams['Время_локализации_пожара_мин']} мин</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Ликвидация открытого горения:</span>
                  <span className="font-mono">{additionalParams['Время_ликвидации_открытого_горения_мин']} мин</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Ликвидация последствий:</span>
                  <span className="font-mono">{additionalParams['Время_ликвидации_последствий_пожара_мин']} мин</span>
                </div>
                <div className="flex justify-between border-t border-gray-700 mt-2 pt-2">
                  <span className="text-gray-300 font-semibold">Итого потушено за:</span>
                  <span className="font-mono text-emerald-300 font-bold">
                    {additionalParams['Время_локализации_пожара_мин'] +
                     additionalParams['Время_ликвидации_открытого_горения_мин'] +
                     additionalParams['Время_ликвидации_последствий_пожара_мин']} мин
                  </span>
                </div>
              </div>
            </div>
          )}

          {currentStage >= 4 && (
            <button
              onClick={handleNewFire}
              className="mt-2 w-full py-2 bg-orange-700 hover:bg-orange-600 rounded font-semibold text-sm"
            >
              🔄 Новый пожар
            </button>
          )}

          <p className="text-xs text-gray-400 mt-3">
            🔮 <span className="text-purple-300">Прогноз</span> — предсказание модели (время).
            ⭐ <span className="text-emerald-300">Рекомендация</span> — совет по силам (стволы, техника).
          </p>
        </div>

        {/* Ошибки */}
        {error && (
          <div className="sticky top-2 z-50 bg-red-900 border-2 border-red-500 rounded-lg p-4 mb-6 shadow-xl">
            <div className="flex justify-between items-start gap-4">
              <div>
                <p className="text-red-100 font-semibold mb-1">Ошибка запроса</p>
                <p className="text-red-200 text-sm break-all">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-200 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Загрузка */}
        {loading && (
          <div className="bg-blue-900 border border-blue-700 rounded-lg p-4 mb-6">
            <p className="text-blue-200">Загрузка...</p>
          </div>
        )}

        {/* Результаты */}
        <div className="space-y-3">
          {stageResults.map((result, idx) => {
            if (!result) return null;

            const stageLabel = idx === 3 ? 'Финальный этап' : `Этап ${idx + 1}`;

            const actualStvols = initialParams['Всего_подано_пожарных_стволов_ед'];
            const recommendedStvols = result['Всего_подано_пожарных_стволов_ед'];

            return (
              <div key={idx} className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3">{stageLabel}</h3>

                {idx < 3 && typeof recommendedStvols === 'number' && (
                  <div className={`mb-3 p-2 rounded border ${
                    recommendedStvols > actualStvols
                      ? 'bg-orange-900/30 border-orange-500/50'
                      : recommendedStvols < actualStvols
                        ? 'bg-green-900/30 border-green-500/50'
                        : 'bg-blue-900/30 border-blue-500/50'
                  }`}>
                    <div className="text-sm flex justify-between items-center">
                      <span className="text-gray-300">
                        📊 Фактически подано: <span className="font-mono font-bold">{actualStvols}</span> ств.
                      </span>
                      <span className={`font-mono font-bold ${
                        recommendedStvols > actualStvols ? 'text-orange-300' :
                        recommendedStvols < actualStvols ? 'text-green-300' : 'text-blue-300'
                      }`}>
                        ⭐ Рекомендуется: {recommendedStvols} ств.
                        {recommendedStvols > actualStvols && ' ▲ увеличить'}
                        {recommendedStvols < actualStvols && ' ▼ уменьшить'}
                        {recommendedStvols === actualStvols && ' ✓ достаточно'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {PARAM_ORDER.filter(key => key in result).map((key) => {
                    const value = result[key];
                    const isRecommended = RECOMMENDED_KEYS.has(key);
                    const isForecast = FORECAST_KEYS.has(key);
                    const label = PARAM_LABELS[key] || key;

                    let tag = null;
                    if (isForecast) {
                      tag = <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-200 ml-2">🔮 прогноз</span>;
                    } else if (isRecommended) {
                      tag = <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-200 ml-2">⭐ рекомендация</span>;
                    }

                    return (
                      <div key={key} className="flex justify-between items-center text-sm py-1 border-b border-gray-700/50">
                        <span className="text-gray-400 flex items-center">
                          {label}
                          {tag}
                        </span>
                        <span className={`font-mono font-semibold ${
                          isForecast ? 'text-purple-200' : isRecommended ? 'text-emerald-200' : 'text-white'
                        }`}>
                          {formatValue(value)}
                          {isForecast && ' мин'}
                          {key === 'Всего_подано_пожарных_стволов_ед' && ' ств.'}
                          {(key.includes('автомобилей') || key.includes('поездов')) && ' ед.'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
