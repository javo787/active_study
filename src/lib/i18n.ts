'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from '../locales/en.json';
import ruTranslation from '../locales/ru.json';
import tjTranslation from '../locales/tj.json';

const resources = {
  en: enTranslation,
  ru: ruTranslation,
  tj: tjTranslation
};

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: 'ru',
      debug: false,
      interpolation: {
        escapeValue: false, // React already escapes values
      },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
      }
    });
}

export default i18n;
