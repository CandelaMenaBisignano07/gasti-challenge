const PROMPT_DATE_FMT = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' });

/** Formats an ISO date as a day + month string, e.g. "14 de mayo". */
export function formatPromptDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return PROMPT_DATE_FMT.format(d);
}
