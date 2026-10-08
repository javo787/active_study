import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ru from '@/locales/ru.json';
import en from '@/locales/en.json';
import tj from '@/locales/tj.json';

type Tree = { translation: { assistant: Record<string, string>; nav: Record<string, string> } };
const locales: Record<string, Tree> = { ru: ru as Tree, en: en as Tree, tj: tj as Tree };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const files = [...sourceFiles('src/features/assistant'), 'src/app/dashboard/student/assistant/page.tsx', 'src/app/dashboard/student/assistant/session/SessionLoader.tsx', 'src/app/dashboard/student/assistant/bank/BankLoader.tsx'];
const code = files.map(f => readFileSync(f, 'utf8')).join('\n');

describe('Assistant translations', () => {
  it('every language has exactly the same keys', () => {
    const keys = (l: string) => Object.keys(locales[l].translation.assistant).sort();
    expect(keys('en')).toEqual(keys('ru'));
    expect(keys('en')).toEqual(keys('tj'));
  });

  it('no value is empty, and every {{placeholder}} appears in all three languages', () => {
    const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
    for (const [key, value] of Object.entries(locales.en.translation.assistant)) {
      for (const l of ['ru', 'tj']) {
        const other = locales[l].translation.assistant[key];
        expect(other?.trim(), `${l}.${key} is empty`).toBeTruthy();
        expect(placeholders(other), `${l}.${key} placeholders`).toBe(placeholders(value));
      }
    }
  });

  it('every key used in the code exists (static keys and the ones built from a kind/mode/scope/sort)', () => {
    const have = new Set(Object.keys(locales.en.translation.assistant));
    const used = new Set<string>();
    const staticKey = /t\(\s*['"`]assistant\.([a-z_]+)['"`]/g;
    let match: RegExpExecArray | null;
    while ((match = staticKey.exec(code)) !== null) used.add(match[1]);

    // Dynamic keys: t(`assistant.mode_${...}`) etc. Every possible suffix must exist.
    const dynamic: Record<string, string[]> = {
      mode_: ['single', 'multiple', 'mixed'],
      scope_: ['all', 'random', 'range'],
      sort_: ['recent', 'name', 'progress'],
      status_: ['new', 'wrong', 'correct'],
      issue_: ['ignored_line', 'unmarked_option', 'unmarked_question', 'inline_options', 'no_text', 'few_options', 'no_correct', 'duplicate'],
    };
    for (const [prefix, suffixes] of Object.entries(dynamic)) {
      expect(code.includes(`assistant.${prefix}\${`), `no code builds assistant.${prefix}…`).toBe(true);
      for (const s of suffixes) used.add(`${prefix}${s}`);
    }

    const missing = Array.from(used).filter(k => !have.has(k));
    expect(missing).toEqual([]);
  });

  it('has no translation that the code never uses', () => {
    const prefixes = ['mode_', 'scope_', 'sort_', 'status_', 'issue_'];
    const unused = Object.keys(locales.en.translation.assistant).filter(
      k => !prefixes.some(p => k.startsWith(p)) && !code.includes(`assistant.${k}'`) && !code.includes(`assistant.${k}\``) && !code.includes(`assistant.${k}"`)
    );
    expect(unused).toEqual([]);
  });

  it('the sidebar label exists in every language', () => {
    for (const l of ['ru', 'en', 'tj']) expect(locales[l].translation.nav.assistant?.trim()).toBeTruthy();
  });
});
