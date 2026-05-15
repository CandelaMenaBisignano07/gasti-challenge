const arsFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatArsAmount(value: number, { signed = false }: { signed?: boolean } = {}): string {
  const isNeg = value < 0;
  const body = arsFormatter.format(Math.abs(value));
  if (signed && isNeg) return `−$${body}`;
  if (signed) return `$${body}`;
  return `$${body}`;
}
