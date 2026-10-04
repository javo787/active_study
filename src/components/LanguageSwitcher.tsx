'use client';

import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'ru', label: 'RU' },
    { code: 'en', label: 'EN' },
    { code: 'tj', label: 'TJ' },
  ];

  const currentLang = languages.find((l) => l.code === i18n.language) || languages[0];

  const toggleOpen = () => setIsOpen((prev) => !prev);

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        onClick={toggleOpen}
        className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-100 text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Globe className="w-5 h-5 text-slate-500" />
        <span className="font-medium text-sm">{currentLang.label}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-24 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
          <div className="py-1" role="menu" aria-orientation="vertical">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`w-full text-left px-4 py-2 text-sm min-h-[44px] hover:bg-slate-50 transition-colors ${
                  i18n.language === lang.code ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-slate-700'
                }`}
                role="menuitem"
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
