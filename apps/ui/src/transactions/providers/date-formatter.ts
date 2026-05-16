const FMT = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function formatTransactionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return FMT.format(d).replace(/\./g, '').toLowerCase();
}
