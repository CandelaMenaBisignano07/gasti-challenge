import type { Locale } from '@/shared/i18n/locale';

const FMT_ES = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const FMT_EN = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function formatTransactionDate(iso: string, locale: Locale = 'es'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = locale === 'en' ? FMT_EN : FMT_ES;
  return fmt.format(d).replace(/\./g, '').toLowerCase();
}
