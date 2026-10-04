import { useEffect, useState } from 'react';
import { checkAsoNeeded, formatHour, getSeasonName } from '../utils/sunsetCalculator';

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
  workDate: string;
  workTime: string;
  seasonName: string;
  needsAso: boolean;
  asoReason: string;
  sunsetTime: string;
  sunriseTime: string;
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
  workDate: '',
  workTime: '',
  seasonName: '',
  needsAso: false,
  asoReason: '',
  sunsetTime: '',
  sunriseTime: '',
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

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function isValidTime(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [hh, mm] = s.split(':').map(Number);
  return hh >= 0 && hh < 24 && mm >= 0 && mm < 60;
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
    const rawDate = safeParse<string>(localStorage.getItem('prediction_workDate'), '');
    const rawTime = safeParse<string>(localStorage.getItem('prediction_workTime'), '');
    const workDate = isValidDate(rawDate) ? rawDate : '';
    const workTime = isValidTime(rawTime) ? rawTime : '';

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

    // --- Итерация 7: АСО ---
    const totalForecast = forecastExtinguishTotal ?? 0;
    const asoCheck = checkAsoNeeded(workDate, workTime, totalForecast);
    const seasonName = workDate ? getSeasonName(new Date(workDate).getMonth()) : '';

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
      workDate,
      workTime,
      seasonName,
      needsAso: asoCheck.needsAso,
      asoReason: asoCheck.reason,
      sunsetTime: formatHour(asoCheck.sunsetHour),
      sunriseTime: formatHour(asoCheck.sunriseHour),
    });
  }, []);

  return summary;
}
