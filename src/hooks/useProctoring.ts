import { useEffect, useRef } from 'react';
import { doc, updateDoc, increment, serverTimestamp, arrayUnion, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'react-hot-toast';

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
}: UseProctoringProps) => {
  const attemptIdRef = useRef(attemptId);
  const statusRef = useRef(status);
  const leftAtRef = useRef<number | null>(null);
  const violationCountRef = useRef(0);
  const lastToastRef = useRef<number>(0);
  const terminatedRef = useRef(false);

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

    const handleAway = () => {
      if (leftAtRef.current === null) {
        leftAtRef.current = Date.now();
      }
    };

    const handleReturn = () => {
      if (leftAtRef.current !== null) {
        const timeAway = Date.now() - leftAtRef.current;
        leftAtRef.current = null;
        if (timeAway >= graceMs) {
          registerViolation('left_exam_area');
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleAway();
      } else {
        handleReturn();
      }
    };

    const handleWindowBlur = () => {
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      if (!isTouch) {
        handleAway();
      }
    };

    const handleWindowFocus = () => {
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      if (!isTouch) {
        handleReturn();
      }
    };

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

    if (attemptId && statusRef.current !== 'completed' && statusRef.current !== 'flagged' && statusRef.current !== 'terminated') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleWindowBlur);
        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('copy', preventCopyPaste);
        document.addEventListener('paste', preventCopyPaste);
        document.addEventListener('contextmenu', preventContextMenu);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('copy', preventCopyPaste);
      document.removeEventListener('paste', preventCopyPaste);
      document.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [attemptId, isPreviewMode, enabled, maxViolations, graceMs, computeScoreSnapshot, onTerminate, onWarning, status]);
};
