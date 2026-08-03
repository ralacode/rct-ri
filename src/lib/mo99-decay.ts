import { addDays, differenceInHours, format, parse } from "date-fns";

export interface Mo99DecayResult {
  day: number;
  date: string;
  time?: string;
  activity: number;
}

const HALF_LIFE = 65.94; // 時間

export function calculateMo99Decay(
  calibrationDate: string,
  calibrationTime: string,
  calibrationActivity: number,
): Mo99DecayResult[] {
  // 検定日時
  const start = parse(
    `${calibrationDate} ${calibrationTime}`,
    "yyyy/MM/dd HH:mm",
    new Date(),
  );

  const results: Mo99DecayResult[] = [];

  const DISPLAY_DAYS = 14;

  for (let i = 1; i <= DISPLAY_DAYS; i++) {
    const target = addDays(start, i);

    const elapsedHours = differenceInHours(target, start);

    const activity =
      calibrationActivity * Math.pow(0.5, elapsedHours / HALF_LIFE);

    results.push({
      day: i,
      date: format(target, "yyyy/MM/dd"),
      time: format(target, "HH:mm"),
      activity: Math.round(activity),
    });
  }

  return results;
}
