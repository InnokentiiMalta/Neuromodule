import { useState, useEffect, useRef } from 'react';
import { computeCrewComposition, clampUnitCount } from '../utils/crew';

import { predictStage, sendFinalData, getDataStatus } from '../api/backend';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import StageCard from '../components/StageCard';
import { Wagon } from '../types';

interface InitialParams {
  Время_следования_мин: number;
  Время_подачи_первого_ствола_мин: number;
  Количество_основных_пожарных_автомобилей_ед: number;
  Количество_специальных_пожарных_автомобилей_ед: number;
  Количество_пожарных_поездов_ед: number;
  Всего_подано_пожарных_стволов_ед: number;
  Скорость_распространения_огня_м_мин: number;
}

export const DEFAULT_INITIAL_PARAMS: InitialParams = {
  Время_следования_мин: 8,
  Время_подачи_первого_ствола_мин: 1,
  Количество_основных_пожарных_автомобилей_ед: 2,
  Количество_специальных_пожарных_автомобилей_ед: 0,
  Количество_пожарных_поездов_ед: 0,
  Всего_подано_пожарных_стволов_ед: 1,
  Скорость_распространения_огня_м_мин: 2.5,
};

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

export default function PredictionPanel({ onMapUpdate, onReset }: { onMapUpdate?: () => void; onReset?: () => void } = {}) {
  const [initialParams, setInitialParams] = useLocalStorageState<InitialParams>('prediction_initialParams', DEFAULT_INITIAL_PARAMS);

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
    const storedInitial = (() => {
      try { return JSON.parse(localStorage.getItem('prediction_initialParams') || 'null'); } catch { return null; }
    })();
    const data: Record<string, number> = {
      ...DEFAULT_INITIAL_PARAMS,
      ...(storedInitial || {}),
      ...initialParams,
    };

    data['Количество_основных_пожарных_автомобилей_ед'] = currentActuals.ac;
    data['Количество_специальных_пожарных_автомобилей_ед'] = currentActuals.asa + currentActuals.aso;
    data['Количество_пожарных_поездов_ед'] = currentActuals.trains;
    data['Всего_подано_пожарных_стволов_ед'] = currentActuals.stvols;

    if (stage >= 1) {
      data['Время_локализации_пожара_мин'] = additionalParams['Время_локализации_пожара_мин'] ?? 0;
    }
    if (stage >= 2) {
      data['Время_ликвидации_открытого_горения_мин'] = additionalParams['Время_ликвидации_открытого_горения_мин'] ?? 0;
    }
    if (stage >= 3) {
      data['Время_ликвидации_последствий_пожара_мин'] = additionalParams['Время_ликвидации_последствий_пожара_мин'] ?? 0;
    }

    return data;
  };

  const handlePredict = async (stage: number) => {
    setLoading(true);
    setError(null);

    // --- ВАЛИДАЦИЯ СИЛ И СРЕДСТВ ---
    const minPersonnel = currentActuals.ac + currentActuals.stvols;
    if (currentActuals.personnel < minPersonnel) {
      alert(`Недостаточно личного состава!\nДля ${currentActuals.ac} АЦ и ${currentActuals.stvols} стволов требуется минимум ${minPersonnel} человек.`);
      setError(`Недостаточно личного состава! Для ${currentActuals.ac} АЦ и ${currentActuals.stvols} стволов требуется минимум ${minPersonnel} человек (1 водитель на АЦ + 1 ствольщик на ствол). Сейчас указано: ${currentActuals.personnel}.`);
      setLoading(false);
      return;
    }
    // --------------------------------

    try {
      const inputData = buildInputData(stage);
      const result = await predictStage(inputData, stage);

      // Проверяем темное время суток (с 18:00 до 06:00)
      const hour = parseInt(workTime.split(':')[0], 10);
      const isDark = hour >= 18 || hour < 6;
      if (isDark) {
        (result as Record<string, any>)['Количество_АСО_ед'] = Math.max(1, (result as Record<string, any>)['Количество_АСО_ед'] || 0);
      }

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

  const handlePlaceForces = (stageIdx: number, useActual: boolean) => {
    let ac = 0, asa = 0, aso = 0, trains = 0, totalPersonnel = 0, stvols = 0;

    if (useActual) {
      const actuals = stageActuals[stageIdx];
      if (!actuals) return;
      ac = actuals.ac; asa = actuals.asa; aso = actuals.aso; 
      trains = actuals.trains; totalPersonnel = actuals.personnel; stvols = actuals.stvols;
    } else {
      const result = stageResults[stageIdx] as Record<string, number> | null;
      if (!result) return;
      ac = result['Количество_основных_пожарных_автомобилей_ед'] || 0;
      asa = result['Количество_АСА_ед'] || 0;
      aso = result['Количество_АСО_ед'] || 0;
      trains = result['Количество_пожарных_поездов_ед'] || 0;
      totalPersonnel = result['Количество_людей_ед'] || 0;
      stvols = result['Всего_подано_пожарных_стволов_ед'] || 0;
    }

    // Клампинг количества техники по лимитам
    const acCount = clampUnitCount('ac', ac);
    const asaCount = clampUnitCount('asa', asa);
    const asoCount = clampUnitCount('aso', aso);

    // Стволы делим только между АЦ и АСА (АСО не подает стволы)
    const totalVehicles = acCount + asaCount;
    
    // Распределяем стволы (в том числе по несколько на одну машину, если их больше)
    const supplyTotal = acCount + asaCount;
const nozzlePlan: number[] = new Array(supplyTotal + asoCount).fill(0);
const firstPass = Math.min(stvols, supplyTotal, 4);
for (let i = 0; i < firstPass; i++) nozzlePlan[i] = 1;
let extra = Math.max(0, Math.min(stvols, 8) - firstPass);
for (let i = 0; i < firstPass && extra > 0; i++) { nozzlePlan[i] += 1; extra--; }
let planCursor = 0;
    
    
    
    if (totalVehicles === 0 && trains === 0) {
      alert('Нет техники для расстановки на этом этапе.');
      return;
    }

    const existingUnits = JSON.parse(localStorage.getItem('map_manualUnits') || '[]');
    // Удаляем технику, которая была добавлена предыдущими нажатиями кнопок расстановки
    const filteredUnits = existingUnits.filter((u: any) => u.role !== 'Рекомендовано ML' && u.role !== 'Фактические силы' && u.type !== 'train');
    const newUnits = [...filteredUnits];

    // Читаем координаты очага пожара с карты
    let startX = 100;
    let startY = 100;
    try {
      const fireStr = localStorage.getItem('map_fireSource');
      if (fireStr) {
        const fire = JSON.parse(fireStr);
        if (fire && fire.x && fire.y) {
          // Центрируем технику вокруг очага (чуть выше него)
          startX = Math.max(20, fire.x - 150);
          startY = Math.max(20, fire.y - 200);
        }
      }
    } catch (e) {}

    let waterSources: { x: number, y: number }[] = [];
    try {
      const waterStr = localStorage.getItem('map_waterSources');
      if (waterStr) {
        const ws = JSON.parse(waterStr);
        if (ws && ws.length > 0) {
          waterSources = ws.map((w: any) => ({ x: w.x, y: w.y }));
        }
      }
    } catch (e) {}
    let wsIndex = 0;

    // Выделяем по 3 человека на каждую АСО
    const asoPersonnelNeeded = aso * 3;
    const remainingPersonnel = Math.max(0, totalPersonnel - asoPersonnelNeeded);

    // Остальных делим только между АЦ и АСА
    const nonAsoVehicles = ac + asa;
    const basePersonnel = nonAsoVehicles > 0 ? Math.floor(remainingPersonnel / nonAsoVehicles) : 0;
    let remainder = nonAsoVehicles > 0 ? remainingPersonnel % nonAsoVehicles : 0;

    const addUnits = (count: number, type: string, name: string, canDeployPTV: boolean, fixedPersonnel?: number) => {
      for (let i = 0; i < count; i++) {
        let p = fixedPersonnel !== undefined ? fixedPersonnel : basePersonnel + (remainder > 0 ? 1 : 0);
        if (fixedPersonnel === undefined && remainder > 0) remainder--;

        const planned = nozzlePlan[planCursor] ?? 0;
        planCursor++;
        const n = Math.min(planned, computeCrewComposition(type, p).nozzles);
        let finalX = startX;
        let finalY = startY;
        // Если это АЦ или АСА, и есть свободный водоисточник — ставим на него
        if ((type === 'ac' || type === 'asa') && wsIndex < waterSources.length) {
          finalX = waterSources[wsIndex].x;
          finalY = waterSources[wsIndex].y;
          wsIndex++;
        }
        newUnits.push({
          id: `manual-${Date.now()}-${type}-${i}`,
          type: type as any,
          name: name,
          x: finalX,
          y: finalY,
          angle: 0,
          personnel: p,
          hoses: n,
          nozzles: n,
          role: useActual ? 'Фактические силы' : 'Рекомендовано ML',
          safeDistance: 200,
          division: '',
          ptvDeployed: n > 0,
        });
        startX += 50;
        if (startX > 600) { startX = 100; startY += 60; }
      }
    };

    addUnits(acCount, 'ac', 'АЦ-40', true);
    addUnits(asaCount, 'asa', 'АСА', true);
    addUnits(asoCount, 'aso', 'АСО', false, 3); // АСО получает фиксированные 3 человека


// Очищаем старые позиции стволов и разветвлений для новых машин,
    // чтобы карта использовала расчётное количество, а не застрявшие координаты
    localStorage.removeItem('map_customPositions');
    localStorage.removeItem('map_customPumpPositions');
    localStorage.removeItem('map_unitSideInfo');
    localStorage.setItem('map_manualUnits', JSON.stringify(newUnits));

    // Пожарный поезд — хранится отдельно (не в manualUnits), перезаписывается при каждом нажатии
    const trainCount = clampUnitCount('train', trains);
    const mainWagons: Wagon[] = JSON.parse(localStorage.getItem('map_wagons') || '[]');
    const mainRightEdge = mainWagons.length > 0
      ? Math.max(...mainWagons.map(w => w.x + w.width))
      : 700;
    const trainStartX = Math.min(mainRightEdge + 100, 990 - 3 * 56);
    const trainWagons: Wagon[] = [];
    for (let i = 0; i < 3; i++) {
      const isTank = i === 1;
      trainWagons.push({
        id: i + 1,
        x: trainStartX + i * 56,
        y: 296.5,
        width: 50,
        height: 7,
        type: isTank ? 'tank' : 'freight',
        label: isTank ? `Цистерна ПП ${i + 1}` : `Вагон ПП ${i + 1}`,
      });
    }
    const trainList = trainCount > 0 ? [{ id: `train-${Date.now()}`, wagons: trainWagons, personnel: 2 }] : [];
    localStorage.setItem('map_fireTrains', JSON.stringify(trainList));
    localStorage.setItem(
      'map_fireTrainPTW',
      JSON.stringify(trainCount > 0 ? { [trainList[0]!.id]: true } : {})
    );

    onMapUpdate?.();
    alert(`На карту добавлено: ${acCount} АЦ, ${asaCount} АСА, ${asoCount} АСО, ${trainCount} поездов. Перейдите на карту.`);
  };

  const handleRollback = (stageIndex: number) => {
    const timeKeys: (string | null)[] = [
      null,
      'Время_локализации_пожара_мин',
      'Время_ликвидации_открытого_горения_мин',
      'Время_ликвидации_последствий_пожара_мин',
    ];
    const saved = stageActuals[stageIndex];
    const nextCurrent = saved ?? currentActuals;
    const nextActuals = stageActuals.map((a, i) => (i >= stageIndex ? null : a));
    const nextResults = stageResults.map((r, i) => (i >= stageIndex ? null : r));
    const nextAdditional = { ...additionalParams } as Record<string, number>;
    for (let i = stageIndex + 1; i < 4; i++) {
      const k = timeKeys[i];
      if (k) nextAdditional[k] = 0;
    }

    setCurrentActuals(nextCurrent);
    setStageActuals(nextActuals);
    setStageResults(nextResults);
    setAdditionalParams(nextAdditional as unknown as typeof additionalParams);
    setCurrentStage(stageIndex);
    setFinalSubmitted(false);

    localStorage.setItem('prediction_currentActuals', JSON.stringify(nextCurrent));
    localStorage.setItem('prediction_stageActuals', JSON.stringify(nextActuals));
    localStorage.setItem('prediction_stageResults', JSON.stringify(nextResults));
    localStorage.setItem('prediction_additionalParams', JSON.stringify(nextAdditional));
    localStorage.setItem('prediction_currentStage', JSON.stringify(stageIndex));
    localStorage.setItem('prediction_finalSubmitted', 'false');

    onMapUpdate?.();
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
      finalData['Количество_основных_пожарных_автомобилей_ед'] = currentActuals.ac;
      finalData['Количество_специальных_пожарных_автомобилей_ед'] = currentActuals.asa + currentActuals.aso;
      finalData['Количество_пожарных_поездов_ед'] = currentActuals.trains;
      finalData['Всего_подано_пожарных_стволов_ед'] = currentActuals.stvols;
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
      Скорость_распространения_огня_м_мин: 2.5,
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
    onReset?.();
  };

  const formatValue = (v: unknown): string => {
    if (typeof v === 'number') {
      return v.toFixed(2);
    }
    return String(v);
  };

  const buildSummaryRows = (): string[][] => {
    const stageNames = ['1 РТП', 'Локализация', 'Ликвидация открытого горения', 'Полная ликвидация'];
    const timeKeys: (string | null)[] = [null, 'Время_локализации_пожара_мин', 'Время_ликвидации_открытого_горения_мин', 'Время_ликвидации_последствий_пожара_мин'];
    const header = ['Этап','Стволов прогноз','Стволов факт','АЦ прогноз','АЦ факт','АСО прогноз','АСО факт','АСА прогноз','АСА факт','Поезд прогноз','Поезд факт','Л/С прогноз','Л/С факт','Время прогноз, мин','Время факт, мин'];
    const rows: string[][] = [header];
    for (let i = 0; i < 4; i++) {
      const r = (stageResults[i] || {}) as Record<string, number>;
      const a = stageActuals[i];
      const tk = timeKeys[i];
      const fSrc = i >= 1 ? (stageResults[i - 1] || {}) as Record<string, number> : null;
      const ap = additionalParams as unknown as Record<string, number>;
      rows.push([
        stageNames[i],
        r['Всего_подано_пожарных_стволов_ед'] ?? '',
        a?.stvols ?? '',
        r['Количество_основных_пожарных_автомобилей_ед'] ?? '',
        a?.ac ?? '',
        r['Количество_АСО_ед'] ?? '',
        a?.aso ?? '',
        r['Количество_АСА_ед'] ?? '',
        a?.asa ?? '',
        r['Количество_пожарных_поездов_ед'] ?? '',
        a?.trains ?? '',
        r['Количество_людей_ед'] ?? '',
        a?.personnel ?? '',
        tk && fSrc ? (fSrc[tk] ?? '') : '',
        tk ? (ap[tk] ?? '') : '',
      ].map(v => String(v)));
    }
    return rows;
  };

  const handleExportSummaryCsv = () => {
    const csv = '\uFEFF' + buildSummaryRows().map(r => r.join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `itog_pozhara_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryRows().map(r => r.join('\t')).join('\n'));
    } catch { /* буфер недоступен — молча */ }
  };

  return (
    <div className="space-y-3 p-2">
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
              <label className="block text-sm text-gray-300 mb-1">Момент прибытия 1 пожарного подразделения</label>
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
          <h2 className="text-lg font-semibold mb-3">🚒 Начальные параметры</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Время следования (мин)</label>
              <input 
                type="number" 
                value={initialParams['Время_следования_мин']} 
                onChange={(e) => setInitialParams(prev => ({ ...prev, 'Время_следования_мин': parseFloat(e.target.value) || 0 }))} 
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white" 
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Время подачи первого ствола (мин)</label>
              <input 
                type="number" 
                value={initialParams['Время_подачи_первого_ствола_мин']} 
                onChange={(e) => setInitialParams(prev => ({ ...prev, 'Время_подачи_первого_ствола_мин': parseFloat(e.target.value) || 0 }))} 
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white" 
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Скорость распространения огня (м/мин)</label>
              <input 
                type="number" 
                step="0.1" 
                value={initialParams['Скорость_распространения_огня_м_мин']} 
                onChange={(e) => setInitialParams(prev => ({ ...prev, 'Скорость_распространения_огня_м_мин': parseFloat(e.target.value) || 2.5 }))} 
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white" 
              />
            </div>
          </div>
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
            const stageTimeKey = stageIdx === 1 ? 'Время_локализации_пожара_мин' : stageIdx === 2 ? 'Время_ликвидации_открытого_горения_мин' : stageIdx === 3 ? 'Время_ликвидации_последствий_пожара_мин' : null;
            const forecastTime = stageTimeKey ? (stageResults[stageIdx - 1]?.[stageTimeKey] as number | undefined) : undefined;

            const stageResult = stageResults[stageIdx] as Record<string, number> | null;
            const forecastAc = stageResult?.['Количество_основных_пожарных_автомобилей_ед'];
            const forecastTrains = stageResult?.['Количество_пожарных_поездов_ед'];

            const forecastAso = (stageResult?.['Количество_АСО_ед'] ?? null) as number | null;
            const forecastAsa = (stageResult?.['Количество_АСА_ед'] ?? null) as number | null;
            const forecastPersonnel = (stageResult?.['Количество_людей_ед'] ?? null) as number | null;

            return (
              <StageCard
                key={stageIdx}
                stageIndex={stageIdx}
                stageLabel={stageConfig.label}
                timeLabel={stageConfig.timeLabel}
                timeHint={stageConfig.timeHint}
                state={state}
                actuals={isFixed ? stageActuals[stageIdx] : null}
                current={currentActuals}
                timeValue={timeValue}
                forecastForce={isFixed ? forecastForce : null}
                forecastTime={isFixed ? forecastTime : null}
                forecastAc={isFixed ? forecastAc : null}
                forecastAso={isFixed ? forecastAso : null}
                forecastAsa={isFixed ? forecastAsa : null}
                forecastTrains={isFixed ? forecastTrains : null}
                forecastPersonnel={isFixed ? forecastPersonnel : null}
                onActualsChange={setCurrentActuals}
                onTimeChange={(v) => {
                  const key = stageIdx === 1 ? 'Время_локализации_пожара_мин' : stageIdx === 2 ? 'Время_ликвидации_открытого_горения_мин' : 'Время_ликвидации_последствий_пожара_мин';
                  setAdditionalParams(prev => ({ ...prev, [key]: v }));
                }}
                onFix={() => handlePredict(stageIdx)}
                loading={loading}
                onPlaceForces={() => handlePlaceForces(stageIdx, false)}
                onPlaceActuals={() => handlePlaceForces(stageIdx, true)}
                onRollback={handleRollback}
              />
            );
          })}
        </div>

        {/* Кнопки этапов */}
        <div className="bg-gray-800 rounded-lg p-4 mb-3">
          <h2 className="text-lg font-semibold mb-4">Этапы прогнозирования</h2>


        {currentStage >= 4 && (
          <div className="mt-4 mb-4 bg-gray-900 rounded-lg p-4 border border-blue-700/50">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1 shrink-0">
                <h3 className="text-sm font-semibold text-blue-300 mb-0">📊 Итоговый анализ пожара</h3>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={handleExportSummaryCsv} title="Скачать CSV" className="px-2 py-0.5 text-[10px] bg-emerald-700 hover:bg-emerald-600 rounded">📥 CSV</button>
                <button onClick={handleCopySummary} title="Скопировать таблицу" className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded">📋</button>
              </div>
            </div>
            <div className="flex gap-3 text-[9px] text-gray-400 mb-1.5">
              <span><span className="text-purple-300">■</span> прогноз / рекомендация</span>
              <span><span className="text-emerald-300">■</span> факт</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[9px] tabular-nums text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-600 text-gray-400">
                    <th className="py-0.5 px-1 text-left whitespace-nowrap">Этап</th>
                    <th className="py-0.5 px-1 text-right whitespace-nowrap">Стволов</th>
                    <th className="py-0.5 px-1 text-right whitespace-nowrap">АЦ</th>
                    <th className="py-0.5 px-1 text-right whitespace-nowrap">АСО</th>
                    <th className="py-0.5 px-1 text-right whitespace-nowrap">АСА</th>
                    <th className="py-0.5 px-1 text-right whitespace-nowrap">ПП</th>
                    <th className="py-0.5 px-1 text-right whitespace-nowrap">Л/С</th>
                    <th className="py-0.5 px-1 text-right whitespace-nowrap">Время</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {[
                    { idx: 0, label: '📍 1 РТП', timeKey: 'Время_локализации_пожара_мин' },
                    { idx: 1, label: '🎯 Локал.', timeKey: 'Время_локализации_пожара_мин' },
                    { idx: 2, label: '🔥 Ликв. ОГ', timeKey: 'Время_ликвидации_открытого_горения_мин' },
                    { idx: 3, label: '✅ Полная', timeKey: 'Время_ликвидации_последствий_пожара_мин' },
                  ].map((row) => {
                    const fRes = stageResults[row.idx] as Record<string, number> | null;
                    const a = stageActuals[row.idx];

                    const fStvols = fRes?.['Всего_подано_пожарных_стволов_ед'];
                    const fAc = fRes?.['Количество_основных_пожарных_автомобилей_ед'];
                    const fAso = fRes?.['Количество_АСО_ед'];
                    const fAsa = fRes?.['Количество_АСА_ед'];
                    const fTrains = fRes?.['Количество_пожарных_поездов_ед'];
                    const fPersonnel = fRes?.['Количество_людей_ед'];
                    
                    const timeKey = row.idx === 1 ? 'Время_локализации_пожара_мин' : row.idx === 2 ? 'Время_ликвидации_открытого_горения_мин' : row.idx === 3 ? 'Время_ликвидации_последствий_пожара_мин' : null;
                    const forecastSource = row.idx >= 1 ? (stageResults[row.idx - 1] as Record<string, number> | null) : null;
                    const fTime = timeKey && forecastSource ? (forecastSource[timeKey] as number | undefined) : undefined;
                    const aTime = timeKey ? (additionalParams[timeKey as keyof typeof additionalParams] as number | undefined) : undefined;

                    return (
                      <tr key={row.idx} className="border-b border-gray-700/50 text-[9px]">
                        <td className="py-0.5 px-1 text-gray-200 whitespace-nowrap">{row.label}</td>
                        
                        <td className="py-0.5 px-1 text-right whitespace-nowrap">
                          <span className="text-purple-300">{fStvols != null ? `${fStvols}` : '—'}</span>
                          <span className="text-gray-500 mx-1">/</span>
                          <span className="text-emerald-300">{a ? `${a.stvols}` : '—'}</span>
                        </td>
                        
                        <td className="py-0.5 px-1 text-right whitespace-nowrap">
                          <span className="text-purple-300">{fAc != null ? `${fAc}` : '—'}</span>
                          <span className="text-gray-500 mx-1">/</span>
                          <span className="text-emerald-300">{a ? `${a.ac}` : '—'}</span>
                        </td>
                        
                        <td className="py-0.5 px-1 text-right whitespace-nowrap">
                          <span className="text-purple-300">{fAso != null ? `${fAso}` : '—'}</span>
                          <span className="text-gray-500 mx-1">/</span>
                          <span className="text-emerald-300">{a ? `${a.aso}` : '—'}</span>
                        </td>

                        <td className="py-0.5 px-1 text-right whitespace-nowrap">
                          <span className="text-purple-300">{fAsa != null ? `${fAsa}` : '—'}</span>
                          <span className="text-gray-500 mx-1">/</span>
                          <span className="text-emerald-300">{a ? `${a.asa}` : '—'}</span>
                        </td>

                        <td className="py-0.5 px-1 text-right whitespace-nowrap">
                          <span className="text-purple-300">{fTrains != null ? `${fTrains}` : '—'}</span>
                          <span className="text-gray-500 mx-1">/</span>
                          <span className="text-emerald-300">{a ? `${a.trains}` : '—'}</span>
                        </td>

                        <td className="py-0.5 px-1 text-right whitespace-nowrap">
                          <span className="text-purple-300">{fPersonnel != null ? `${fPersonnel}` : '—'}</span>
                          <span className="text-gray-500 mx-1">/</span>
                          <span className="text-emerald-300">{a ? `${a.personnel}` : '—'}</span>
                        </td>

                        <td className="py-0.5 px-1 text-right whitespace-nowrap">
                          <span className="text-purple-300">{fTime != null ? `${fTime.toFixed(1)}` : '—'}</span>
                          <span className="text-gray-500 mx-1">/</span>
                          <span className="text-emerald-300">{aTime != null && aTime > 0 ? `${aTime}` : '—'}</span>
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
            {finalSubmitted ? '✓ Данные отправлены' : '💾 Отправка в базу данных'}
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
  );
}
