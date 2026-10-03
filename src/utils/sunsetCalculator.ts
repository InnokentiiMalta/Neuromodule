/**
 * Упрощённая таблица времени заката/рассвета для средней полосы России.
 * Значения приближённые, достаточны для определения «нужен ли АСО».
 * Формат: [рассвет_часы_десятичные, закат_часы_десятичные]
 */
const MONTHLY_SUN_TIMES: Record<number, { sunrise: number; sunset: number }> = {
  0:  { sunrise: 9.0,  sunset: 16.5 },  // январь
  1:  { sunrise: 8.0,  sunset: 17.5 },  // февраль
  2:  { sunrise: 6.5,  sunset: 18.9 },  // март
  3:  { sunrise: 5.2,  sunset: 20.4 },  // апрель
  4:  { sunrise: 4.0,  sunset: 21.6 },  // май
  5:  { sunrise: 3.5,  sunset: 22.0 },  // июнь
  6:  { sunrise: 4.0,  sunset: 21.7 },  // июль
  7:  { sunrise: 5.2,  sunset: 20.7 },  // август
  8:  { sunrise: 6.5,  sunset: 19.0 },  // сентябрь
  9:  { sunrise: 8.0,  sunset: 17.4 },  // октябрь
  10: { sunrise: 8.5,  sunset: 16.0 },  // ноябрь
  11: { sunrise: 9.0,  sunset: 15.5 },  // декабрь
};

export interface AsoCheckResult {
  needsAso: boolean;
  sunriseHour: number;
  sunsetHour: number;
  workStartHour: number;
  workEndHour: number;
  crossesNight: boolean;
  reason: string;
}

/**
 * Проверяет, нужен ли АСО для данных работ.
 * @param dateIso — дата в формате YYYY-MM-DD
 * @param startTime — время начала в формате HH:MM
 * @param durationMinutes — прогноз длительности тушения (мин)
 */
export function checkAsoNeeded(
  dateIso: string,
  startTime: string,
  durationMinutes: number
): AsoCheckResult {
  const empty: AsoCheckResult = {
    needsAso: false,
    sunriseHour: 0,
    sunsetHour: 0,
    workStartHour: 0,
    workEndHour: 0,
    crossesNight: false,
    reason: 'Дата или время не указаны',
  };

  if (!dateIso || !startTime) return empty;

  const date = new Date(dateIso);
  if (isNaN(date.getTime())) return { ...empty, reason: 'Некорректная дата' };

  const [hh, mm] = startTime.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return { ...empty, reason: 'Некорректное время' };

  const month = date.getMonth();
  const { sunrise, sunset } = MONTHLY_SUN_TIMES[month];

  const workStartHour = hh + mm / 60;
  const workEndHour = workStartHour + durationMinutes / 60;

  // Определяем, попадает ли интервал работ в тёмное время
  // Тёмное = до рассвета ИЛИ после заката
  const startIsDark = workStartHour < sunrise || workStartHour >= sunset;
  const endIsDark = workEndHour > sunset || workEndHour < sunrise;
  // Если время начала > времени окончания (переход через полночь)
  const crossesMidnight = workEndHour >= 24;

  const crossesNight = startIsDark || endIsDark || crossesMidnight;

  let reason = '';
  if (crossesNight) {
    if (startIsDark) {
      reason = 'Работы начинаются в тёмное время суток';
    } else if (endIsDark) {
      reason = 'Работы завершаются после заката';
    } else if (crossesMidnight) {
      reason = 'Работы продолжаются после полуночи';
    }
  } else {
    reason = 'Работы в светлое время суток';
  }

  return {
    needsAso: crossesNight,
    sunriseHour: sunrise,
    sunsetHour: sunset,
    workStartHour,
    workEndHour: workEndHour > 24 ? workEndHour - 24 : workEndHour,
    crossesNight,
    reason,
  };
}

/** Форматирование десятичного часа в HH:MM */
export function formatHour(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Название сезона по месяцу */
export function getSeasonName(month: number): string {
  if (month === 11 || month <= 1) return 'Зима';
  if (month <= 4) return 'Весна';
  if (month <= 7) return 'Лето';
  return 'Осень';
}
