import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import arAuth from './locales/ar/auth.json';
import arCommon from './locales/ar/common.json';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';

export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const resources = {
  ar: { common: arCommon, auth: arAuth },
  en: { common: enCommon, auth: enAuth },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: 'ar',
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    ns: ['common', 'auth'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'mezan-ui-language',
    },
  });

function applyDocumentDirection(lng: string) {
  const html = document.documentElement;
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  html.setAttribute('lang', lng);
  html.setAttribute('dir', dir);
}

applyDocumentDirection(i18n.language);
i18n.on('languageChanged', applyDocumentDirection);

export default i18n;
