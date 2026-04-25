import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import arAdmin from './locales/ar/admin.json';
import arAuth from './locales/ar/auth.json';
import arCatalog from './locales/ar/catalog.json';
import arCommon from './locales/ar/common.json';
import arInventory from './locales/ar/inventory.json';
import arPos from './locales/ar/pos.json';
import arPurchasing from './locales/ar/purchasing.json';
import enAdmin from './locales/en/admin.json';
import enAuth from './locales/en/auth.json';
import enCatalog from './locales/en/catalog.json';
import enCommon from './locales/en/common.json';
import enInventory from './locales/en/inventory.json';
import enPos from './locales/en/pos.json';
import enPurchasing from './locales/en/purchasing.json';

export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const resources = {
  ar: {
    common: arCommon,
    auth: arAuth,
    pos: arPos,
    admin: arAdmin,
    catalog: arCatalog,
    inventory: arInventory,
    purchasing: arPurchasing,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    pos: enPos,
    admin: enAdmin,
    catalog: enCatalog,
    inventory: enInventory,
    purchasing: enPurchasing,
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: 'ar',
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    ns: ['common', 'auth', 'pos', 'admin', 'catalog', 'inventory', 'purchasing'],
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
