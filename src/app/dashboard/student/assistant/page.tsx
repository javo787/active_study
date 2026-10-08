'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { ArrowUpDown, BookOpen, Download, FilePlus2, GraduationCap, Pencil, Play, ShieldAlert, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { btnPrimary, btnQuiet, field, fieldLabel } from '@/components/ui/styles';
import { useAssistDb } from '@/features/assistant/useAssistDb';
import {
  deleteBank,
  getAllProgress,
  getOpenSession,
  getProgress,
  getQuestions,
  listBanks,
  renameBank,
  requestPersistentStorage,
  saveBank,
  saveSession,
} from '@/features/assistant/db';
import { buildBank, newId } from '@/features/assistant/bank';
import { buildSession, seededRng, statsFromProgress } from '@/features/assistant/engine';
import { decodeTextFile, serializeBank } from '@/features/assistant/parser';
import { downloadTextFile, safeFileName } from '@/features/assistant/download';
import BankCard from '@/features/assistant/components/BankCard';
import ImportDialog, { type ImportEntry, type ImportedBank } from '@/features/assistant/components/ImportDialog';
import Modal from '@/features/assistant/components/Modal';
import StartDialog from '@/features/assistant/components/StartDialog';
import type { AssistBank, AssistQuestion, BankStats, QuestionProgress, SessionConfig, SessionMode } from '@/features/assistant/types';

type Sort = 'recent' | 'name' | 'progress';
const SORTS: Sort[] = ['recent', 'name', 'progress'];
const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface StartState {
  bank: AssistBank;
  mode: SessionMode;
  questions: AssistQuestion[];
  progress: Map<string, QuestionProgress>;
}

export default function AssistantPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { db, failed } = useAssistDb();

  const [banks, setBanks] = useState<AssistBank[] | null>(null);
  const [stats, setStats] = useState<Map<string, BankStats>>(new Map());
  const [openSessions, setOpenSessions] = useState<Map<string, string>>(new Map());
  const [sort, setSort] = useState<Sort>('recent');

  const [importEntries, setImportEntries] = useState<ImportEntry[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [active, setActive] = useState<AssistBank | null>(null);
  const [renaming, setRenaming] = useState<AssistBank | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<AssistBank | null>(null);
  const [starting, setStarting] = useState<StartState | null>(null);
  const [startBusy, setStartBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!db) return;
    const [list, progress] = await Promise.all([listBanks(db), getAllProgress(db)]);

    const rowsByBank = new Map<string, QuestionProgress[]>();
    progress.forEach(row => {
      const rows = rowsByBank.get(row.bankId);
      if (rows) rows.push(row);
      else rowsByBank.set(row.bankId, [row]);
    });

    const nextStats = new Map<string, BankStats>();
    const nextOpen = new Map<string, string>();
    const now = Date.now();
    for (const bank of list) {
      nextStats.set(bank.id, statsFromProgress(bank.questionCount, rowsByBank.get(bank.id) ?? []));
      const open = await getOpenSession(db, bank.id, now);
      if (open) nextOpen.set(bank.id, open.id);
    }
    setBanks(list);
    setStats(nextStats);
    setOpenSessions(nextOpen);
  }, [db]);

  useEffect(() => {
    refresh().catch(() => toast.error(t('assistant.db_error')));
  }, [refresh, t]);

  const sorted = useMemo(() => {
    const list = (banks ?? []).slice();
    if (sort === 'name') list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'progress') list.sort((a, b) => (stats.get(a.id)?.percentCorrect ?? 0) - (stats.get(b.id)?.percentCorrect ?? 0));
    return list;
  }, [banks, stats, sort]);

  const chooseFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const entries: ImportEntry[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        if (file.size > MAX_FILE_BYTES) throw new Error('too big');
        entries.push({ name: file.name, text: decodeTextFile(await file.arrayBuffer()) });
      } catch {
        toast.error(`${t('assistant.read_error')}: ${file.name}`);
      }
    }
    if (fileInput.current) fileInput.current.value = '';
    if (entries.length > 0) setImportEntries(entries);
  };

  const saveImport = async (list: ImportedBank[]) => {
    if (!db) return;
    setImporting(true);
    try {
      const now = Date.now();
      for (let i = 0; i < list.length; i++) {
        const { bank, questions } = buildBank({ title: list[i].title, sourceName: list[i].sourceName, parsed: list[i].questions, now: now + i });
        await saveBank(db, bank, questions);
      }
      void requestPersistentStorage();
      toast.success(t('assistant.imported', { n: list.length }));
      setImportEntries(null);
      await refresh();
    } catch {
      toast.error(t('assistant.db_error'));
    } finally {
      setImporting(false);
    }
  };

  const beginStart = async (bank: AssistBank, mode: SessionMode) => {
    if (!db) return;
    setActive(null);
    try {
      const [questions, progress] = await Promise.all([getQuestions(db, bank.id), getProgress(db, bank.id)]);
      setStarting({ bank, mode, questions, progress });
    } catch {
      toast.error(t('assistant.db_error'));
    }
  };

  const startSession = async (config: SessionConfig) => {
    if (!db || !starting) return;
    setStartBusy(true);
    try {
      const session = buildSession({
        id: newId(),
        bank: starting.bank,
        mode: starting.mode,
        questions: starting.questions,
        progress: starting.progress,
        config,
        now: Date.now(),
        rng: seededRng((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0),
      });
      if (!session) {
        toast.error(t('assistant.problem_none'));
        return;
      }
      await saveSession(db, session);
      router.push(`/dashboard/student/assistant/session?id=${session.id}`);
    } catch {
      toast.error(t('assistant.db_error'));
    } finally {
      setStartBusy(false);
    }
  };

  const exportBank = async (bank: AssistBank) => {
    if (!db) return;
    setActive(null);
    try {
      downloadTextFile(safeFileName(bank.title), serializeBank(await getQuestions(db, bank.id)));
    } catch {
      toast.error(t('assistant.db_error'));
    }
  };

  const confirmRename = async () => {
    if (!db || !renaming) return;
    await renameBank(db, renaming.id, renameValue, Date.now());
    toast.success(t('assistant.renamed'));
    setRenaming(null);
    await refresh();
  };

  const confirmDelete = async () => {
    if (!db || !deleting) return;
    await deleteBank(db, deleting.id);
    toast.success(t('assistant.deleted'));
    setDeleting(null);
    await refresh();
  };

  if (failed) {
    return (
      <div role="alert" className="flex gap-3 items-start bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm">
        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <p>{t('assistant.db_error')}</p>
      </div>
    );
  }

  const importButton = (
    <button type="button" className={btnPrimary} onClick={() => fileInput.current?.click()} disabled={!db}>
      <FilePlus2 className="w-4 h-4" aria-hidden="true" />
      {t('assistant.import')}
    </button>
  );

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title={t('assistant.title')}
        description={t('assistant.subtitle')}
        actions={
          <>
            {banks && banks.length > 1 && (
              <button
                type="button"
                className={btnQuiet}
                onClick={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])}
                aria-label={t(`assistant.sort_${sort}`)}
              >
                <ArrowUpDown className="w-4 h-4" aria-hidden="true" />
                {t(`assistant.sort_${sort}`)}
              </button>
            )}
            {importButton}
          </>
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept=".txt,.qst,text/plain"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label={t('assistant.import_choose')}
        onChange={e => void chooseFiles(e.target.files)}
      />

      {banks === null ? (
        <div className="h-24 bg-slate-200 rounded-xl animate-pulse" aria-busy="true" aria-label={t('assistant.loading')} />
      ) : banks.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={t('assistant.empty_title')}
          description={t('assistant.empty_text')}
          actionText={t('assistant.import_choose')}
          onAction={() => fileInput.current?.click()}
        />
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2">
            {sorted.map(bank => (
              <BankCard
                key={bank.id}
                bank={bank}
                stats={stats.get(bank.id) ?? statsFromProgress(bank.questionCount, [])}
                hasOpenSession={openSessions.has(bank.id)}
                onOpen={() => setActive(bank)}
              />
            ))}
          </ul>
          <p className="text-xs text-slate-500 max-w-prose">{t('assistant.storage_note')}</p>
        </>
      )}

      {active && (
        <Modal title={active.title} closeLabel={t('assistant.close')} onClose={() => setActive(null)}>
          <div className="flex flex-col gap-2">
            {openSessions.has(active.id) && (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => router.push(`/dashboard/student/assistant/session?id=${openSessions.get(active.id)}`)}
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                {t('assistant.continue')}
              </button>
            )}
            <button type="button" className={openSessions.has(active.id) ? btnQuiet : btnPrimary} onClick={() => void beginStart(active, 'training')}>
              {t('assistant.training')}
            </button>
            <button type="button" className={btnQuiet} onClick={() => router.push(`/dashboard/student/assistant/bank?id=${active.id}`)}>
              <BookOpen className="w-4 h-4" aria-hidden="true" />
              {t('assistant.view')}
            </button>
            <button type="button" className={btnQuiet} onClick={() => void beginStart(active, 'exam')}>
              {t('assistant.exam')}
            </button>
            <hr className="my-1 border-slate-200" />
            <button
              type="button"
              className={btnQuiet}
              onClick={() => {
                setRenameValue(active.title);
                setRenaming(active);
                setActive(null);
              }}
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
              {t('assistant.rename')}
            </button>
            <button type="button" className={btnQuiet} onClick={() => void exportBank(active)}>
              <Download className="w-4 h-4" aria-hidden="true" />
              {t('assistant.export')}
            </button>
            <button
              type="button"
              className={`${btnQuiet} !text-red-700 !border-red-200 hover:!bg-red-50`}
              onClick={() => {
                setDeleting(active);
                setActive(null);
              }}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              {t('assistant.delete')}
            </button>
          </div>
        </Modal>
      )}

      {importEntries && <ImportDialog entries={importEntries} saving={importing} onClose={() => setImportEntries(null)} onSave={list => void saveImport(list)} />}

      {starting && (
        <StartDialog
          bank={starting.bank}
          mode={starting.mode}
          questions={starting.questions}
          progress={starting.progress}
          starting={startBusy}
          onClose={() => setStarting(null)}
          onStart={config => void startSession(config)}
        />
      )}

      {renaming && (
        <Modal
          title={t('assistant.rename_title')}
          closeLabel={t('assistant.close')}
          onClose={() => setRenaming(null)}
          footer={
            <>
              <button type="button" className={btnQuiet} onClick={() => setRenaming(null)}>
                {t('assistant.cancel')}
              </button>
              <button type="button" className={btnPrimary} onClick={() => void confirmRename()} disabled={!renameValue.trim()}>
                {t('assistant.save_changes')}
              </button>
            </>
          }
        >
          <label className={fieldLabel} htmlFor="rename-bank">
            {t('assistant.rename_label')}
          </label>
          <input
            id="rename-bank"
            className={field}
            value={renameValue}
            maxLength={120}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && renameValue.trim()) void confirmRename();
            }}
            autoFocus
          />
        </Modal>
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        title={t('assistant.delete_title')}
        message={deleting ? t('assistant.delete_text', { title: deleting.title }) : ''}
        confirmText={t('assistant.delete')}
        cancelText={t('assistant.cancel')}
        isDestructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
