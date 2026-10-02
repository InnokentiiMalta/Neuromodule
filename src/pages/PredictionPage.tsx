import { useState } from 'react';
import { Link } from 'react-router-dom';
import { predictStage } from '../api/backend';

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

export default function PredictionPage() {
  const [initialParams, setInitialParams] = useState<InitialParams>({
    Время_следования_мин: 8,
    Время_подачи_первого_ствола_мин: 1,
    Количество_основных_пожарных_автомобилей_ед: 2,
    Количество_специальных_пожарных_автомобилей_ед: 0,
    Количество_пожарных_поездов_ед: 0,
    Всего_подано_пожарных_стволов_ед: 1,
  });

  const [additionalParams, setAdditionalParams] = useState<AdditionalParams>({
    Время_локализации_пожара_мин: 0,
    Время_ликвидации_открытого_горения_мин: 0,
    Время_ликвидации_последствий_пожара_мин: 0,
  });

  const [currentStage, setCurrentStage] = useState(0);
  const [stageResults, setStageResults] = useState<(Record<string, unknown> | null)[]>([null, null, null, null]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            return (
              <div key={idx} className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3">
                  {idx === 3 ? 'Финальный этап' : `Этап ${idx + 1}`}
                </h3>
                <div className="space-y-2">
                  {Object.entries(result).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-gray-400">{key}:</span>
                      <span className="text-white font-mono">{formatValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
