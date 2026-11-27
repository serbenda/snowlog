// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// The interface's languages. The text is written in English in the code; other languages translate it in
// i18n-<lang>.js, string by string. A string with no translation is shown in English. {name}-style holes are filled
// by fill(); plural() picks the singular or the plural form, both of which are keys.
import { ES } from './i18n-es.js';
import { CA } from './i18n-ca.js';
import { FR } from './i18n-fr.js';
import { PT } from './i18n-pt.js';

export const LANGS = ['en', 'es', 'ca', 'fr', 'pt'];
export const LANG_NAMES = { en: 'English', es: 'Español', ca: 'Català', fr: 'Français', pt: 'Português' };
const DICTS = { en: {}, es: ES, ca: CA, fr: FR, pt: PT };

// The language to use: the one chosen, or the browser's when it is "auto" (English if it isn't one we have).
export function pickLang(choice, navigatorLangs = []) {
  if (LANGS.includes(choice)) return choice;
  for (const l of navigatorLangs) {
    const base = String(l || '').toLowerCase().split('-')[0];
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

// A translator for one language: t('English text') → its translation, or the English text itself.
export function translator(lang) {
  const dict = DICTS[lang] || {};
  return (s) => (Object.hasOwn(dict, s) ? dict[s] : s);
}

// Fills {name}-style holes after translating: fill(t('Opened "{name}"'), { name }).
export const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));

// Every key a dictionary may hold must be a string the code uses: checked by the tests.
export const dictionaries = DICTS;
