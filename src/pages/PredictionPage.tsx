import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { predictStage, sendFinalData, getDataStatus } from '../api/backend';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import StageCard from '../components/StageCard';

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

export interface StageActuals {
  ac: number;
  asa: number;
  aso: number;
  trains: number;
  stvols: number;
  personnel: number;
}

const EMPTY_STAGE_ACTUALS: StageActuals = {
  ac: 0, asa: 0, aso: 0, trains: 0, stvols: 0, personnel: 0,
};

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
  const [stageActuals, setStageActuals] = useLocalStorageState<(StageActuals | null)[]>('prediction_stageActuals', [null, null, null, null]);
  const [currentActuals, setCurrentActuals] = useLocalStorageState<StageActuals>('prediction_currentActuals', EMPTY_STAGE_ACTUALS);
  const [workDate, setWorkDate] = useLocalStorageState<string>('prediction_workDate', '');
  const [workTime, setWorkTime] = useLocalStorageState<string>('prediction_workTime', '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalSubmitted, setFinalSubmitted] = useLocalStorageState<boolean>('prediction_finalSubmitted', false);
  const [dataStatus, setDataStatus] = useState<{ total_rows: number; new_rows: number; threshold: number } | null>(null);
  const paramsHashRef = useRef<string>('');

  useEffect(() => {
    const loadStatus = async () => {
      const status = await getDataStatus();
      if (status) setDataStatus(status);
    };
    loadStatus();
  }, [finalSubmitted]);

  useEffect(() => {
    const currentHash = JSON.stringify({ i: initialParams, a: additionalParams });
    if (paramsHashRef.current === '') {
      paramsHashRef.current = currentHash;
      return;
    }
    if (paramsHashRef.current !== currentHash) {
      paramsHashRef.current = currentHash;
      if (finalSubmitted) {
        setFinalSubmitted(false);
      }
    }
  }, [initialParams, additionalParams, finalSubmitted, setFinalSubmitted]);

  const handleInitialChange = (key: keyof InitialParams, value: string) => {
    setInitialParams(prev => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const handleAdditionalChange = (key: keyof AdditionalParams, value: string) => {
    setAdditionalParams(prev => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const buildInputData = (stage: number) => {
    const data: Record<string, number> = { ...initialParams };

    // Для этапов > 0 используем фактические силы, введённые РТП на карточке этапа
    if (stage >= 1) {
      data['Количество_основных_пожарных_автомобилей_ед'] = currentActuals.ac;
      data['Количество_специальных_пожарных_автомобилей_ед'] = currentActuals.asa + currentActuals.aso;
      data['Количество_пожарных_поездов_ед'] = currentActuals.trains;
    }

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
      // Фиксируем текущие фактические силы для этого этапа
      setStageActuals(prev => {
        const newActuals = [...prev];
        newActuals[stage] = { ...currentActuals };
        return newActuals;
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
    setStageActuals([null, null, null, null]);
    setCurrentActuals(EMPTY_STAGE_ACTUALS);
    setWorkDate('');
    setWorkTime('');
    setFinalSubmitted(false);
    setError(null);
    // Сброс данных прогноза
    ['prediction_initialParams', 'prediction_additionalParams', 'prediction_currentStage',
     'prediction_stageResults', 'prediction_workDate', 'prediction_workTime',
     'prediction_finalSubmitted', 'prediction_stageActuals', 'prediction_currentActuals'].forEach(k => localStorage.removeItem(k));
    // Сброс обстановки карты
    ['map_wagons', 'map_fireSource', 'map_obstacles', 'map_deployment',
     'map_manualUnits', 'map_fireTrains', 'map_waterSources', 'map_resources',
     'map_useCustomResources', 'map_customPositions', 'map_customPumpPositions',
     'map_fireTrainPTW', 'map_scale'].forEach(k => localStorage.removeItem(k));
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

        {/* Карточки этапов */}
        <div className="space-y-3 mb-3">
          {[0, 1, 2, 3].map((stageIdx) => {
            const isLocked = stageIdx > currentStage;
            const isFixed = stageIdx < currentStage;
            const state = isLocked ? 'locked' : (isFixed ? 'fixed' : 'active');

            const stageConfig = [
              { label: '📍 На момент прибытия 1 РТП', timeLabel: undefined, timeHint: undefined },
              { label: '🎯 Локализация', timeLabel: 'Время локализации (мин)', timeHint: 'Длительность фазы локализации' },
              { label: '🔥 Ликвидация открытого горения', timeLabel: 'Время ликвидации горения (мин)', timeHint: 'Длительность фазы ликвидации горения' },
              { label: '✅ Полная ликвидация', timeLabel: 'Время ликвидации последствий (мин)', timeHint: 'Длительность последней фазы. Полная ликвидация = все работы завершены.' },
            ][stageIdx];

            const timeValue = stageIdx === 0 ? 0 : (additionalParams[stageIdx === 1 ? 'Время_локализации_пожара_мин' : stageIdx === 2 ? 'Время_ликвидации_открытого_горения_мин' : 'Время_ликвидации_последствий_пожара_мин'] || 0);

            const forecastForce = stageResults[stageIdx]?.['Всего_подано_пожарных_стволов_ед'] as number | undefined;
            const forecastTime = stageIdx < 3 ? (stageResults[stageIdx]?.[stageIdx === 0 ? 'Время_локализации_пожара_мин' : stageIdx === 1 ? 'Время_ликвидации_открытого_горения_мин' : 'Время_ликвидации_последствий_пожара_мин'] as number | undefined) : undefined;

            return (
              <StageCard
                key={stageIdx}
                stageIndex={stageIdx}
                stageLabel={stageConfig.label}
                timeLabel={stageConfig.timeLabel}
                timeHint={stageConfig.timeHint}
                state={state}
                actuals={isFixed ? currentActuals : null}
                current={currentActuals}
                timeValue={timeValue}
                forecastForce={isFixed ? forecastForce : null}
                forecastTime={isFixed ? forecastTime : null}
                onActualsChange={setCurrentActuals}
                onTimeChange={(v) => {
                  const key = stageIdx === 1 ? 'Время_локализации_пожара_мин' : stageIdx === 2 ? 'Время_ликвидации_открытого_горения_мин' : 'Время_ликвидации_последствий_пожара_мин';
                  setAdditionalParams(prev => ({ ...prev, [key]: v }));
                }}
                onFix={() => handlePredict(stageIdx)}
                loading={loading}
              />
            );
          })}
        </div>

        {/* Карточки этапов */}
        <div className="space-y-3 mb-3">
          {[0, 1, 2, 3].map((stageIdx) => {
            const isLocked = stageIdx > currentStage;
            const isFixed = stageIdx < currentStage;
            const state = isLocked ? 'locked' : (isFixed ? 'fixed' : 'active');

            const stageConfig = [
              { label: '📍 На момент прибытия 1 РТП', timeLabel: undefined, timeHint: undefined },
              { label: '🎯 Локализация', timeLabel: 'Время локализации (мин)', timeHint: 'Длительность фазы локализации' },
              { label: '🔥 Ликвидация открытого горения', timeLabel: 'Время ликвидации горения (мин)', timeHint: 'Длительность фазы ликвидации горения' },
              { label: '✅ Полная ликвидация', timeLabel: 'Время ликвидации последствий (мин)', timeHint: 'Длительность последней фазы. Полная ликвидация = все работы завершены.' },
            ][stageIdx];

            const timeValue = stageIdx === 0 ? 0 : (additionalParams[stageIdx === 1 ? 'Время_локализации_пожара_мин' : stageIdx === 2 ? 'Время_ликвидации_открытого_горения_мин' : 'Время_ликвидации_последствий_пожара_мин'] || 0);

            const forecastForce = stageResults[stageIdx]?.['Всего_подано_пожарных_стволов_ед'] as number | undefined;
            const forecastTime = stageIdx < 3 ? (stageResults[stageIdx]?.[stageIdx === 0 ? 'Время_локализации_пожара_мин' : stageIdx === 1 ? 'Время_ликвидации_открытого_горения_мин' : 'Время_ликвидации_последствий_пожара_мин'] as number | undefined) : undefined;

            const showForces = stageIdx > 0;
            const customTimeFields = stageIdx === 0 ? [
              {
                key: 'time_following',
                label: 'Время следования (мин)',
                value: initialParams['Время_следования_мин'],
                onChange: (v: number) => setInitialParams(prev => ({ ...prev, 'Время_следования_мин': v }))
              },
              {
                key: 'time_first_barrel',
                label: 'Время подачи первого ствола (мин)',
                value: initialParams['Время_подачи_первого_ствола_мин'],
                onChange: (v: number) => setInitialParams(prev => ({ ...prev, 'Время_подачи_первого_ствола_мин': v }))
              }
            ] : undefined;

            return (
              <StageCard
                key={stageIdx}
                stageIndex={stageIdx}
                stageLabel={stageConfig.label}
                timeLabel={stageConfig.timeLabel}
                timeHint={stageConfig.timeHint}
                state={state}
                actuals={isFixed ? currentActuals : null}
                current={currentActuals}
                timeValue={timeValue}
                forecastForce={isFixed ? forecastForce : null}
                forecastTime={isFixed ? forecastTime : null}
                onActualsChange={setCurrentActuals}
                onTimeChange={(v) => {
                  const key = stageIdx === 1 ? 'Время_локализации_пожара_мин' : stageIdx === 2 ? 'Время_ликвидации_открытого_горения_мин' : 'Время_ликвидации_последствий_пожара_мин';
                  setAdditionalParams(prev => ({ ...prev, [key]: v }));
                }}
                onFix={() => handlePredict(stageIdx)}
                loading={loading}
                showForces={showForces}
                customTimeFields={customTimeFields}
              />
            );
          })}
        </div>

        {/* Кнопки этапов */}
        <div className="bg-gray-800 rounded-lg p-4 mb-3">
          <h2 className="text-lg font-semibold mb-4">Этапы прогнозирования</h2>


        {currentStage >= 4 && (
          <div className="mt-4 mb-4 bg-gray-900 rounded-lg p-4 border border-blue-700/50">
            <h3 className="text-sm font-semibold text-blue-300 mb-3">📊 Итоговый анализ пожара</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-600 text-gray-400">
                    <th className="py-2 px-1">Этап</th>
                    <th className="py-2 px-1">Рекомендуемые силы</th>
                    <th className="py-2 px-1">Фактически подано</th>
                    <th className="py-2 px-1">Прогноз времени</th>
                    <th className="py-2 px-1">Факт времени</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {[
                    { idx: 0, label: '📍 1 РТП', timeKey: 'Время_локализации_пожара_мин' },
                    { idx: 1, label: '🎯 Локализация', timeKey: 'Время_локализации_пожара_мин' },
                    { idx: 2, label: '🔥 Горение', timeKey: 'Время_ликвидации_открытого_горения_мин' },
                    { idx: 3, label: '✅ Ликвидация', timeKey: 'Время_ликвидации_последствий_пожара_мин' },
                  ].map((row) => {
                    const fForce = stageResults[row.idx]?.['Всего_подано_пожарных_стволов_ед'];
                    const a = stageActuals[row.idx];
                    const fTime = stageResults[row.idx]?.[row.timeKey] as number | undefined;
                    const aTime = additionalParams[row.timeKey as keyof typeof additionalParams];

                    return (
                      <tr key={row.idx} className="border-b border-gray-700/50">
                        <td className="py-2 px-1 text-gray-200">{row.label}</td>
                        <td className="py-2 px-1 text-purple-300">
                          {typeof fForce === 'number' ? `${fForce} ств.` : '—'}
                        </td>
                        <td className="py-2 px-1 text-emerald-300">
                          {a ? `${a.stvols} ств. / ${a.ac} АЦ / ${a.personnel} л/с` : '—'}
                        </td>
                        <td className="py-2 px-1 text-purple-300">
                          {typeof fTime === 'number' ? `${fTime.toFixed(1)} мин` : '—'}
                        </td>
                        <td className="py-2 px-1 text-emerald-300">
                          {aTime ? `${aTime} мин` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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

        </div>
      </div>
    </div>
  );
}
