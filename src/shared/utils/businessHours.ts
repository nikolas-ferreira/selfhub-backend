export interface BusinessHoursDayInput {
  dayOfWeek: number;
  isOpen: boolean;
  openTime?: string | null;
  closeTime?: string | null;
}

const RESTAURANT_TIMEZONE = "America/Sao_Paulo";
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const toMinutes = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
};

/** "What time is it right now, in the restaurant's local time" — day-of-week + minutes since midnight. */
function getLocalNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const weekday = parts.find((p) => p.type === "weekday")!.value;
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  const minute = Number(parts.find((p) => p.type === "minute")!.value);

  return { dayOfWeek: WEEKDAY_INDEX[weekday], minutes: hour * 60 + minute };
}

/**
 * No hours configured at all → always open (so existing restaurants aren't
 * blocked the moment this feature ships). Otherwise checks today's entry,
 * handling the case where `closeTime` wraps past midnight (e.g. 18:00–02:00).
 */
export function isRestaurantOpenNow(businessHours: BusinessHoursDayInput[] | null | undefined): boolean {
  if (!businessHours || businessHours.length === 0) return true;

  const { dayOfWeek, minutes } = getLocalNow();
  const today = businessHours.find((d) => d.dayOfWeek === dayOfWeek);

  if (!today || !today.isOpen || !today.openTime || !today.closeTime) return false;

  const openMinutes = toMinutes(today.openTime);
  const closeMinutes = toMinutes(today.closeTime);

  if (closeMinutes > openMinutes) {
    return minutes >= openMinutes && minutes < closeMinutes;
  }
  // Wraps past midnight.
  return minutes >= openMinutes || minutes < closeMinutes;
}
