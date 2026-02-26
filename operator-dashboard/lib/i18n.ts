import enMessages from '@/messages/en.json';
import esMessages from '@/messages/es.json';

export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (value === 'es') return 'es';
  return 'en';
}

export async function getMessages(locale: SupportedLocale) {
  if (locale === 'es') {
    return esMessages;
  }
  return enMessages;
}
