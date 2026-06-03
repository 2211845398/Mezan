import i18n, { type SupportedLanguage } from '@/i18n';

/** When the account has an explicit locale, align the SPA (and localStorage cache) with it. */
export function syncUiLanguageFromAccount(pref: string | null | undefined): void {
  if (pref !== 'en' && pref !== 'ar') return;
  const lng = pref as SupportedLanguage;
  void i18n.changeLanguage(lng);
}
