const IST_OFFSET_MINUTES = 5 * 60 + 30;

const CHALLENGE_YEAR = 2025;
const CHALLENGE_MONTH = 9; // October (0-indexed)

function createIstDate(
  day: number,
  hour: number,
  minute: number,
  second = 0,
  millisecond = 0,
): Date {
  const utcDate = new Date(Date.UTC(CHALLENGE_YEAR, CHALLENGE_MONTH, day, hour, minute, second, millisecond));
  const utcMillis = utcDate.getTime() - IST_OFFSET_MINUTES * 60 * 1000;

  return new Date(utcMillis);
}

export const CHALLENGE_START = createIstDate(6, 0, 0);
export const CHALLENGE_END = createIstDate(30, 23, 59, 59, 999);

export const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export const challengeWindowMillis = {
  start: CHALLENGE_START.getTime(),
  end: CHALLENGE_END.getTime(),
};
