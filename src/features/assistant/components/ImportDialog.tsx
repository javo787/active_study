'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { btnPrimary, btnQuiet, field, fieldLabel } from '@/components/ui/styles';
import Modal from './Modal';
import { parseBankText, type IssueKind, type ParseIssue, type ParsedQuestion } from '../parser';
import { titleFromFileName } from '../bank';

export interface ImportEntry {
  name: string;
  text: string;
}

export interface ImportedBank {
  title: string;
  sourceName: string;
  questions: ParsedQuestion[];
}

interface Props {
  entries: ImportEntry[];
  saving: boolean;
  onClose: () => void;
  onSave: (banks: ImportedBank[]) => void;
}

const EXAMPLES_PER_KIND = 8;

function groupIssues(issues: ParseIssue[]): [IssueKind, ParseIssue[]][] {
  const map = new Map<IssueKind, ParseIssue[]>();
  for (const issue of issues) {
    const list = map.get(issue.kind) ?? [];
    list.push(issue);
    map.set(issue.kind, list);
  }
  return Array.from(map.entries());
}

export default function ImportDialog({ entries, saving, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const [dedupe, setDedupe] = useState(true);
  const [titles, setTitles] = useState(() => entries.map(e => titleFromFileName(e.name)));

  const parsed = useMemo(() => entries.map(e => parseBankText(e.text, { dedupe })), [entries, dedupe]);
  const addable = parsed.reduce((n, p) => n + (p.questions.length > 0 ? 1 : 0), 0);

  const save = () => {
    const banks: ImportedBank[] = [];
    parsed.forEach((p, i) => {
      if (p.questions.length > 0) {
        banks.push({ title: titles[i].trim() || titleFromFileName(entries[i].name), sourceName: entries[i].name, questions: p.questions });
      }
    });
    onSave(banks);
  };

  return (
    <Modal
      title={t('assistant.import_title')}
      closeLabel={t('assistant.close')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className={btnQuiet} onClick={onClose} disabled={saving}>
            {t('assistant.cancel')}
          </button>
          <button type="button" className={btnPrimary} onClick={save} disabled={saving || addable === 0}>
            {t('assistant.save')}
            {addable > 0 ? ` (${addable})` : ''}
          </button>
        </>
      }
    >
      <label className="flex items-center gap-3 min-h-[44px] mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={dedupe}
          onChange={e => setDedupe(e.target.checked)}
          className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-700">{t('assistant.remove_dupes')}</span>
      </label>

      <ul className="space-y-5">
        {entries.map((entry, i) => {
          const p = parsed[i];
          const invalid = p.skipped - (dedupe ? p.duplicates : 0);
          const groups = groupIssues(p.issues);
          return (
            <li key={`${entry.name}-${i}`} className="border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 break-all mb-2">{entry.name}</p>

              <label className={fieldLabel} htmlFor={`import-title-${i}`}>
                {t('assistant.file_name')}
              </label>
              <input
                id={`import-title-${i}`}
                className={field}
                value={titles[i]}
                maxLength={120}
                onChange={e => setTitles(prev => prev.map((v, k) => (k === i ? e.target.value : v)))}
              />

              {p.questions.length === 0 ? (
                <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{t('assistant.nothing')}</p>
              ) : (
                <p className="mt-3 text-sm text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
                  <span>{t('assistant.found', { n: p.total })}</span>
                  <span className="font-semibold text-emerald-700">{t('assistant.added', { n: p.questions.length })}</span>
                  {p.duplicates > 0 && <span>{t('assistant.duplicates', { n: p.duplicates })}</span>}
                  {invalid > 0 && <span className="text-amber-700">{t('assistant.skipped', { n: invalid })}</span>}
                </p>
              )}

              {groups.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('assistant.issues')}</p>
                  {groups.map(([kind, list]) => (
                    <details key={kind} className="text-sm border border-slate-200 rounded-lg">
                      <summary className="cursor-pointer px-3 py-2 min-h-[44px] flex items-center gap-2">
                        <span className={list[0].skipped ? 'text-amber-700' : 'text-slate-700'}>
                          {t(`assistant.issue_${kind.replace(/-/g, '_')}`)}
                        </span>
                        <span className="text-slate-500">× {list.length}</span>
                      </summary>
                      <ul className="px-3 pb-2 space-y-1 text-xs text-slate-600">
                        {list.slice(0, EXAMPLES_PER_KIND).map((issue, k) => (
                          <li key={k} className="break-words">
                            <span className="text-slate-400">{t('assistant.line', { n: issue.line })}:</span> {issue.excerpt}
                          </li>
                        ))}
                        {list.length > EXAMPLES_PER_KIND && (
                          <li className="text-slate-400">{t('assistant.issues_more', { n: list.length - EXAMPLES_PER_KIND })}</li>
                        )}
                      </ul>
                    </details>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
