import { describe, it, expect } from 'vitest';
import en from './en.json';
import ru from './ru.json';
import tj from './tj.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out[`${prefix}${key}`] = value;
    else Object.assign(out, flatten(value, `${prefix}${key}.`));
  }
  return out;
}

const locales = {
  en: flatten(en.translation as Tree),
  ru: flatten(ru.translation as Tree),
  tj: flatten(tj.translation as Tree),
};

function placeholders(text: string): string[] {
  const found: string[] = [];
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) found.push(match[1]);
  return found.sort();
}

describe('locale files', () => {
  it('have the same keys in every language', () => {
    const reference = Object.keys(locales.en).sort();
    expect(Object.keys(locales.ru).sort()).toEqual(reference);
    expect(Object.keys(locales.tj).sort()).toEqual(reference);
  });

  it('have no empty strings', () => {
    for (const [lang, strings] of Object.entries(locales)) {
      for (const [key, text] of Object.entries(strings)) {
        expect(text.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  it('use the same {{placeholders}} in every language', () => {
    for (const [key, text] of Object.entries(locales.en)) {
      expect(placeholders(locales.ru[key] ?? ''), `ru:${key}`).toEqual(placeholders(text));
      expect(placeholders(locales.tj[key] ?? ''), `tj:${key}`).toEqual(placeholders(text));
    }
  });
});
