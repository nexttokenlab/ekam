import { test, expect } from '@playwright/test';
import { translate, languageLocale } from '../src/lib/i18n';
import { supportedLanguages } from '../src/lib/session';
import translations from '../src/lib/app-translations.json' with { type: 'json' };

test('every app language preserves names and counts in translated statuses', () => {
  for (const language of supportedLanguages) {
    const locale=languageLocale(language);
    expect(translate('Translating Neha…',locale)).toContain('Neha');
    const message=translate('Waiting for {name} to accept. Request expires in {seconds}s.',locale,{name:'Ravi',seconds:24});
    expect(message).toContain('Ravi');
    expect(message).toContain('24');
    expect(message).not.toMatch(/\{\w+\}/);
    if(locale!=='en') expect(translate('Your language',locale)).not.toBe('Your language');
  }
  const sets=Object.values(translations).map(dictionary=>Object.keys(dictionary).sort());
  for(const keys of sets) expect(keys).toEqual(sets[0]);
});

test('retired language preferences fall back without crashing', () => {
  expect(languageLocale('Odia' as any)).toBe('en');
  expect(supportedLanguages).not.toContain('Odia');
});

test('gendered interface text follows the person it describes', () => {
  expect(translate('I speak', 'hi', {}, 'female')).toBe('मैं बोलती हूँ');
  expect(translate('I speak', 'hi', {}, 'male')).toBe('मैं बोलता हूँ');
  expect(translate('I speak', 'hi')).toBe('मैं बोलता हूँ');
  expect(translate('Speaks {language}', 'hi', { language: 'English' }, 'female')).toBe('English बोलती है');
  expect(translate('I speak', 'pa', {}, 'female')).toBe('ਮੈਂ ਬੋਲਦੀ ਹਾਂ');
  expect(translate('Speaks {language}', 'ar', { language: 'English' }, 'female')).toBe('تتحدث English');
  expect(translate('I speak', 'en', {}, 'female')).toBe('I speak');
  expect(translate('Speaks {language}', 'fr', { language: 'anglais' }, 'female')).toBe('Parle anglais');
});
