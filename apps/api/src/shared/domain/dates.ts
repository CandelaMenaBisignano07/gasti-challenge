export function formatIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIso(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function startOfMonth(d: Date): string {
  return formatIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return formatIso(d);
}

export function addMonths(d: Date, n: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + n;
  // Clamp the day so e.g. addMonths(May 31, -1) yields Apr 30, not May 1.
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), maxDay)));
}

export function monthKey(d: Date): string {
  return formatIso(d).slice(0, 7);
}

export function calendarMonthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return {
    from: formatIso(new Date(Date.UTC(y, m - 1, 1))),
    to: formatIso(new Date(Date.UTC(y, m, 0))),
  };
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIso(toIso).getTime() - parseIso(fromIso).getTime()) / 86_400_000);
}

/** Fractional months between two ISO dates (~30-day month), never negative. */
export function monthsBetween(fromIso: string, toIso: string): number {
  return Math.max(daysBetween(fromIso, toIso) / 30, 0);
}
