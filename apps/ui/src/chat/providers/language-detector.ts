import type { Locale } from '@/chat/domain/message';

const SPANISH_HINTS = [
  /\b(el|la|los|las|un|una|de|que|por|para|con|sin|sobre|entre|este|esta|esto|esos|esas)\b/i,
  /\b(cu[aá]nto|gast[eé]|gasto|gastar|cu[aá]l|c[oó]mo|cu[aá]ndo|d[oó]nde|qu[eé])\b/i,
  /\b(pes[oó]s?|hoy|ayer|ma[nñ]ana|semana|mes|a[nñ]o)\b/i,
  /\b(comida|transporte|salud|educaci[oó]n|servicios|entretenimiento|alquiler)\b/i,
  /[ñáéíóú¿¡]/,
];

export function detectLocale(text: string): Locale {
  for (const re of SPANISH_HINTS) {
    if (re.test(text)) return 'es';
  }
  return 'en';
}
