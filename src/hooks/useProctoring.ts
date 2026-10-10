import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, updateDoc, increment, serverTimestamp, arrayUnion, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'react-hot-toast';
import {
  GuardReason,
  WindowMetrics,
  checkWindow,
  graceFor,
  guardedShortcut,
  isEditingText,
  newWindowWatch,
  reasonForCause,
} from '@/lib/examGuard';

interface UseProctoringProps {
  attemptId: string | null;
  initialViolationCount?: number;
  status?: string;
  isPreviewMode?: boolean;
  maxViolations?: number;
  graceMs?: number;
  enabled?: boolean;
  computeScoreSnapshot?: () => { score: number; totalQuestions: number };
  onWarning: (count: number, max: number, reason: string) => void;
  onTerminate: (reason: string) => void;
}

/** Why the page is not in the state of an exam being taken. Any of them covers the questions. */
type AwayCause = 'hidden' | 'unfocused' | 'shrunk';

export interface ProctoringState {
  /** The questions must not be shown: the page is hidden, split, small, unfocused, or a screenshot or print was tried. */
  covered: boolean;
  reason: GuardReason | null;
  /** Look at the window again now (the "back to the exam" button of the cover). */
  recheck: () => void;
}

/** How long the cover stays after a screenshot or print key, so that a held key does not show the exam in between. */
const FLASH_MS = 2500;
/** The same key chord must not count twice (keydown and keyup, key repeat). */
const HARD_VIOLATION_GAP_MS = 3000;
/** Safety net for platforms that do not tell the page about a split screen or an overlay. */
const POLL_MS = 1000;

export const useProctoring = ({
  attemptId,
  status,
  isPreviewMode,
  initialViolationCount = 0,
  maxViolations = 3,
  graceMs = 3000,
  enabled = true,
  computeScoreSnapshot,
  onWarning,
  onTerminate
}: UseProctoringProps): ProctoringState => {
  const attemptIdRef = useRef(attemptId);
  const statusRef = useRef(status);
  const violationCountRef = useRef(0);
  const lastToastRef = useRef<number>(0);
  const terminatedRef = useRef(false);
  const recheckRef = useRef<() => void>(() => {});
  const [cover, setCover] = useState<{ covered: boolean; reason: GuardReason | null }>({ covered: false, reason: null });

  useEffect(() => {
    violationCountRef.current = initialViolationCount;
    terminatedRef.current = false;
  }, [attemptId, initialViolationCount]);

  useEffect(() => {
    attemptIdRef.current = attemptId;
    statusRef.current = status;
  }, [attemptId, status]);

  useEffect(() => {
    if (isPreviewMode || enabled === false) return;

    const registerViolation = (reason: string) => {
      const id = attemptIdRef.current;
      if (!id || statusRef.current === 'completed' || statusRef.current === 'flagged' || statusRef.current === 'terminated') return;
      if (terminatedRef.current) return;

      // Count on the client immediately: a slow or offline connection must never
      // swallow a violation or delay the warning shown to the student.
      const newCount = violationCountRef.current + 1;
      violationCountRef.current = newCount;
      const shouldTerminate = newCount >= maxViolations;
      if (shouldTerminate) terminatedRef.current = true;

      const updates: Record<string, unknown> = {
        violationCount: increment(1),
        violationReason: reason,
        lastViolationAt: serverTimestamp(),
        violations: arrayUnion({ reason, at: Timestamp.now() })
      };

      if (shouldTerminate) {
        updates.status = 'flagged';
        updates.finishedAt = serverTimestamp();
        if (computeScoreSnapshot) {
          const snap = computeScoreSnapshot();
          updates.score = snap.score;
          updates.totalQuestions = snap.totalQuestions;
        }
      }

      // Fire and forget. Firestore queues writes and flushes them in order once the
      // connection is back, so we do not block the UI (or later violations) on the ack.
      updateDoc(doc(db, 'attempts', id), updates).catch((error) => {
        console.error('Failed to record violation:', error);
      });

      if (shouldTerminate) {
        onTerminate(reason);
      } else {
        onWarning(newCount, maxViolations, reason);
      }
    };

    const active = () =>
      !!attemptIdRef.current &&
      statusRef.current !== 'completed' &&
      statusRef.current !== 'flagged' &&
      statusRef.current !== 'terminated';

    // ---- Being away: the page is hidden, another window or panel took the focus, or the window is split or small.
    // One stretch of being away is one violation however many of these happen in it, counted when it has lasted
    // longer than the grace time (so a notification pulled down for a moment is not held against the student), and
    // the questions are covered for the whole stretch.
    const causes = new Set<AwayCause>();
    let episodeReason: GuardReason | null = null;
    let episodeTimer: ReturnType<typeof setTimeout> | null = null;
    let episodeCounted = false;
    let flashReason: GuardReason | null = null;
    let flashTimer: ReturnType<typeof setTimeout> | null = null;
    let lastHardAt = 0;

    const publish = () => {
      const covered = causes.size > 0 || flashReason !== null;
      const reason = flashReason ?? episodeReason;
      setCover(prev => (prev.covered === covered && prev.reason === (covered ? reason : null) ? prev : { covered, reason: covered ? reason : null }));
    };

    const startEpisode = (cause: AwayCause) => {
      episodeReason = reasonForCause(cause);
      episodeCounted = false;
      if (episodeTimer) clearTimeout(episodeTimer);
      episodeTimer = setTimeout(() => {
        episodeTimer = null;
        if (causes.size === 0 || episodeCounted || !active()) return;
        episodeCounted = true;
        registerViolation(episodeReason ?? 'left_exam_area');
      }, graceFor(cause, graceMs));
    };

    const endEpisode = () => {
      if (episodeTimer) clearTimeout(episodeTimer);
      episodeTimer = null;
      episodeReason = null;
      episodeCounted = false;
    };

    const setCause = (cause: AwayCause, on: boolean) => {
      if (on === causes.has(cause)) return;
      const wasAway = causes.size > 0;
      if (on) causes.add(cause);
      else causes.delete(cause);
      if (!wasAway && causes.size > 0) startEpisode(cause);
      if (wasAway && causes.size === 0) endEpisode();
      publish();
    };

    // The focus is trusted only after it was seen once: some in-app browsers never report it, and the student must
    // not be locked out of the exam by that.
    let focusSeen = typeof document.hasFocus === 'function' && document.hasFocus();
    let watch = newWindowWatch();

    const metrics = (): WindowMetrics => ({
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      availWidth: window.screen?.availWidth ?? 0,
      availHeight: window.screen?.availHeight ?? 0,
      devicePixelRatio: window.devicePixelRatio || 1,
      availLeft: (window.screen as Screen & { availLeft?: number })?.availLeft,
      availTop: (window.screen as Screen & { availTop?: number })?.availTop,
    });

    const check = () => {
      if (!active()) return;
      setCause('hidden', document.visibilityState === 'hidden');

      const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
      if (focused) focusSeen = true;
      setCause('unfocused', focusSeen && !focused);

      const result = checkWindow(watch, metrics(), { editing: isEditingText(document.activeElement) });
      watch = result.watch;
      setCause('shrunk', result.shrunk);
    };
    recheckRef.current = () => {
      try { window.focus(); } catch { /* not allowed everywhere */ }
      check();
    };

    // ---- Screenshot and print keys: counted at once, the cover stays for a moment.
    const hardViolation = (reason: GuardReason) => {
      const now = Date.now();
      if (now - lastHardAt < HARD_VIOLATION_GAP_MS) return;
      lastHardAt = now;
      flashReason = reason;
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flashTimer = null;
        flashReason = null;
        publish();
      }, FLASH_MS);
      publish();
      registerViolation(reason);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (!active()) return;
      const found = guardedShortcut(e);
      if (!found) return;
      if (found === 'print_attempt') e.preventDefault();
      if (found === 'screenshot_key') {
        // The image is already on the clipboard when the key comes up; replacing it is the most a page can do.
        try { void navigator.clipboard?.writeText('').catch(() => {}); } catch { /* best effort */ }
      }
      hardViolation(found);
    };

    const handleBeforePrint = () => { if (active()) hardViolation('print_attempt'); };

    const handleActionPrevent = (e: Event, message: string) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastToastRef.current > 5000) {
        toast.error(message);
        lastToastRef.current = now;
      }
    };

    const preventCopyPaste = (e: ClipboardEvent) => handleActionPrevent(e, 'Copy/Paste is disabled during the exam.');
    const preventContextMenu = (e: MouseEvent) => handleActionPrevent(e, 'Right-click is disabled during the exam.');

    const listening = active();
    let poll: ReturnType<typeof setInterval> | null = null;
    const viewport = window.visualViewport;

    if (listening) {
      document.addEventListener('visibilitychange', check);
      window.addEventListener('blur', check);
      window.addEventListener('focus', check);
      window.addEventListener('resize', check);
      window.addEventListener('orientationchange', check);
      viewport?.addEventListener('resize', check);
      window.addEventListener('keydown', handleKey, true);
      window.addEventListener('keyup', handleKey, true);
      window.addEventListener('beforeprint', handleBeforePrint);
      document.addEventListener('copy', preventCopyPaste);
      document.addEventListener('paste', preventCopyPaste);
      document.addEventListener('contextmenu', preventContextMenu);
      poll = setInterval(check, POLL_MS);
      // The window may already be split when the exam is opened.
      check();
    }

    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('blur', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      viewport?.removeEventListener('resize', check);
      window.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('keyup', handleKey, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
      document.removeEventListener('copy', preventCopyPaste);
      document.removeEventListener('paste', preventCopyPaste);
      document.removeEventListener('contextmenu', preventContextMenu);
      if (poll) clearInterval(poll);
      if (episodeTimer) clearTimeout(episodeTimer);
      if (flashTimer) clearTimeout(flashTimer);
      recheckRef.current = () => {};
      setCover(prev => (prev.covered ? { covered: false, reason: null } : prev));
    };
  }, [attemptId, isPreviewMode, enabled, maxViolations, graceMs, computeScoreSnapshot, onTerminate, onWarning, status]);

  const recheck = useCallback(() => recheckRef.current(), []);
  return { covered: cover.covered, reason: cover.reason, recheck };
};
