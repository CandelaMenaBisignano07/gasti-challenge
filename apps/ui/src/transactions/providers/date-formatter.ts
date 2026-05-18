const FMT = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });

/**
 * Formats a date-only `yyyy-MM-dd` string as e.g. "8 may".
 * The y/m/d parts are read explicitly and passed to the local-time `Date`
 * constructor — `new Date('yyyy-MM-dd')` would parse as UTC midnight and shift
 * to the previous day in negative-offset timezones (e.g. Argentina, UTC−3).
 */
export function formatTransactionDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return FMT.format(d).replace(/\./g, '').toLowerCase();
}
