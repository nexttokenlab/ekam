import { createContext, useContext } from 'react';
import translations from './app-translations.json' with { type: 'json' };
import { localeLanguage, validLocale, type Locale } from './onboarding-copy';
import type { Language } from './session';
export const AppLocale = createContext<Locale>('en');
export function languageLocale(language: Language): Locale { return Object.entries(localeLanguage).find(([, value]) => value === language)?.[0] as Locale || 'en'; }
export type Gender = 'male' | 'female';
// Interface text whose grammar follows the gender of the person it describes; the
// shared dictionary holds the masculine or neutral form.
const gendered: Partial<Record<Locale, Record<string, Partial<Record<Gender, string>>>>> = {
  hi: { 'I speak': { female: 'मैं बोलती हूँ' }, 'Speaks {language}': { female: '{language} बोलती है' } },
  mr: { 'I speak': { female: 'मी बोलते' } },
  pa: { 'I speak': { male: 'ਮੈਂ ਬੋਲਦਾ ਹਾਂ', female: 'ਮੈਂ ਬੋਲਦੀ ਹਾਂ' }, 'Speaks {language}': { female: '{language} ਬੋਲਦੀ ਹੈ' } },
  ar: { 'Speaks {language}': { female: 'تتحدث {language}' } },
};
export function translate(text: string, locale: Locale, values: Record<string, string | number> = {}, gender?: Gender | null): string {
  const dictionary = translations as Record<string, Record<string, string>>;
  const translating = /^Translating ([\s\S]+)…$/.exec(text);
  if (translating) { values = { ...values, name: translating[1] }; text = 'Translating {name}…'; }
  const variant = gender ? gendered[locale]?.[text]?.[gender] : undefined;
  return (variant || dictionary[locale]?.[text] || text).replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match));
}
export function useTranslation() { const locale = useContext(AppLocale); return (text: string, values?: Record<string, string | number>, gender?: Gender | null) => translate(text, locale, values, gender); }

export function initialLocale(): Locale {
  const fromLink = new URLSearchParams(location.search).get('lang');
  let saved: string | null = null;
  try { saved = localStorage.getItem('ekam.ui-locale'); } catch { /* Storage may be unavailable. */ }
  return validLocale(fromLink || saved);
}
