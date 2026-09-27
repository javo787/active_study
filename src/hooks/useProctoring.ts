import { useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'react-hot-toast';

interface UseProctoringProps {
  attemptId: string | null;
  status?: string;
  onTerminate: (reason: string) => void;
}

export const useProctoring = ({ attemptId, status, onTerminate }: UseProctoringProps) => {
  const attemptIdRef = useRef(attemptId);
  const statusRef = useRef(status);

  useEffect(() => {
    attemptIdRef.current = attemptId;
    statusRef.current = status;
  }, [attemptId, status]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (statusRef.current === 'completed' || statusRef.current === 'terminated') return;
      if (document.visibilityState === 'hidden') {
        const id = attemptIdRef.current;
        if (id) {
          try {
            await updateDoc(doc(db, 'attempts', id), {
              status: 'flagged',
              violationReason: 'tab_switch'
            });
            toast.error('Exam terminated due to tab switching.');
            onTerminate('tab_switch');
          } catch (error) {
            console.error('Failed to update attempt status on tab switch:', error);
          }
        }
      }
    };

    const handleWindowBlur = async () => {
       if (statusRef.current === 'completed' || statusRef.current === 'terminated') return;
       const id = attemptIdRef.current;
        if (id) {
          try {
            await updateDoc(doc(db, 'attempts', id), {
              status: 'flagged',
              violationReason: 'window_blur'
            });
            toast.error('Exam terminated due to window blur (possible external app usage).');
            onTerminate('window_blur');
          } catch (error) {
            console.error('Failed to update attempt status on window blur:', error);
          }
        }
    };

    const preventCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      toast.error('Copy/Paste is disabled during the exam.');
    };

    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      toast.error('Right-click is disabled during the exam.');
    };

    if (attemptId) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleWindowBlur);
        document.addEventListener('copy', preventCopyPaste);
        document.addEventListener('paste', preventCopyPaste);
        document.addEventListener('contextmenu', preventContextMenu);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('copy', preventCopyPaste);
      document.removeEventListener('paste', preventCopyPaste);
      document.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [attemptId, onTerminate]);
};
