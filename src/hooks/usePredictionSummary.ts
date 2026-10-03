import { useEffect, useState } from 'react';

interface StageResult {
  [key: string]: unknown;
}

interface PredictionSummary {
  hasData: boolean;
  stage: number;
  stageLabel: string;
  recommendedStvols: number | null;
  actualMainVehicles: number;
  actualSpecialVehicles: number;
  actualFireTrains: number;
  forecastLocalization: number | null;
  forecastOpenFlame: number | null;
  forecastConsequences: number | null;
  forecastExtinguishTotal: number | null;
  initialParams: Record<string, number>;
  additionalParams: Record<string, number>;
}

const EMPTY: PredictionSummary = {
  hasData: false,
  stage: 0,
  stageLabel: '',
  recommendedStvols: null,
  actualMainVehicles: 0,
  actualSpecialVehicles: 0,
  actualFireTrains: 0,
  forecastLocalization: null,
  forecastOpenFlame: null,
  forecastConsequences: null,
  forecastExtinguishTotal: null,
  initialParams: {},
  additionalParams: {},
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function pickNumber(obj: Record<string, unknown> | null, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'number' ? v : null;
}

export function usePredictionSummary(): PredictionSummary {
  const [summary, setSummary] = useState<PredictionSummary>(EMPTY);

  useEffect(() => {
    const currentStage = safeParse<number>(localStorage.getItem('prediction_currentStage'), 0);
    const stageResults = safeParse<(StageResult | null)[]>(
      localStorage.getItem('prediction_stageResults'),
      [null, null, null, null]
    );
    const initialParams = safeParse<Record<string, number>>(
      localStorage.getItem('prediction_initialParams'),
      {}
    );
    const additionalParams = safeParse<Record<string, number>>(
      localStorage.getItem('prediction_additionalParams'),
      {}
    );

    if (currentStage < 1 || !stageResults[0]) {
      setSummary(EMPTY);
      return;
    }

    // Объединяем все пройденные этапы (последний имеет приоритет)
    const merged: Record<string, unknown> = {};
    for (let i = 0; i < stageResults.length; i++) {
      const r = stageResults[i];
      if (!r) continue;
      Object.assign(merged, r);
    }

    // Рекомендация модели — только по стволам
    let recommendedStvols: number | null = null;
    for (let i = currentStage - 1; i >= 0; i--) {
      const r = stageResults[i];
      if (!r) continue;
      const v = pickNumber(r, 'Всего_подано_пожарных_стволов_ед');
      if (v !== null) {
        recommendedStvols = v;
        break;
      }
    }

    // Фактические данные о силах — из того, что ввёл пользователь
    const actualMainVehicles = Number(initialParams['Количество_основных_пожарных_автомобилей_ед'] ?? 0);
    const actualSpecialVehicles = Number(initialParams['Количество_специальных_пожарных_автомобилей_ед'] ?? 0);
    const actualFireTrains = Number(initialParams['Количество_пожарных_поездов_ед'] ?? 0);

    // Прогноз времени — по объединённым данным
    const forecastLocalization = pickNumber(merged, 'Время_локализации_пожара_мин');
    const forecastOpenFlame = pickNumber(merged, 'Время_ликвидации_открытого_горения_мин');
    const forecastConsequences = pickNumber(merged, 'Время_ликвидации_последствий_пожара_мин');
    const forecastExtinguishTotal = pickNumber(merged, 'Время_тушения_мин');

    const stageLabel = currentStage === 4 ? 'Финальный' : `Этап ${currentStage}`;

    setSummary({
      hasData: true,
      stage: currentStage,
      stageLabel,
      recommendedStvols,
      actualMainVehicles,
      actualSpecialVehicles,
      actualFireTrains,
      forecastLocalization,
      forecastOpenFlame,
      forecastConsequences,
      forecastExtinguishTotal,
      initialParams,
      additionalParams,
    });
  }, []);

  return summary;
}
