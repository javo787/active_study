with open("src/hooks/useProctoring.ts", "r") as f:
    content = f.read()

import re

# Update interface
content = content.replace(
"""interface UseProctoringProps {
  attemptId: string | null;""",
"""interface UseProctoringProps {
  attemptId: string | null;
  initialViolationCount?: number;"""
)

# Update destructuring
content = content.replace(
"""export const useProctoring = ({
  attemptId,
  status,
  isPreviewMode,
  maxViolations = 3,
  graceMs = 3000,
  onWarning,
  onTerminate
}: UseProctoringProps) => {""",
"""export const useProctoring = ({
  attemptId,
  status,
  isPreviewMode,
  initialViolationCount = 0,
  maxViolations = 3,
  graceMs = 3000,
  onWarning,
  onTerminate
}: UseProctoringProps) => {"""
)

# Add initialViolationCount sync
content = content.replace(
"""  const leftAtRef = useRef<number | null>(null);
  const violationCountRef = useRef(0);
  const lastToastRef = useRef<number>(0);""",
"""  const leftAtRef = useRef<number | null>(null);
  const violationCountRef = useRef(0);
  const lastToastRef = useRef<number>(0);
  const isRegisteringRef = useRef(false);

  useEffect(() => {
    violationCountRef.current = initialViolationCount;
  }, [attemptId, initialViolationCount]);"""
)

# Update registerViolation
content = content.replace(
"""    const registerViolation = async (reason: string) => {
      const id = attemptIdRef.current;
      if (!id || statusRef.current === 'completed' || statusRef.current === 'flagged') return;

      const newCount = violationCountRef.current + 1;
      violationCountRef.current = newCount;

      try {""",
"""    const registerViolation = async (reason: string) => {
      const id = attemptIdRef.current;
      if (!id || statusRef.current === 'completed' || statusRef.current === 'flagged' || statusRef.current === 'terminated') return;
      if (isRegisteringRef.current) return;

      isRegisteringRef.current = true;
      const newCount = violationCountRef.current + 1;
      violationCountRef.current = newCount;

      try {"""
)

content = content.replace(
"""      } catch (error) {
        console.error('Failed to update attempt status on violation:', error);
      }
    };""",
"""      } catch (error) {
        console.error('Failed to update attempt status on violation:', error);
        violationCountRef.current -= 1; // Revert optimistic update on failure
      } finally {
        isRegisteringRef.current = false;
      }
    };"""
)

# Terminate condition for listeners
content = content.replace(
"""    if (attemptId) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleWindowBlur);
        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('copy', preventCopyPaste);
        document.addEventListener('paste', preventCopyPaste);
        document.addEventListener('contextmenu', preventContextMenu);
    }""",
"""    if (attemptId && statusRef.current !== 'completed' && statusRef.current !== 'flagged' && statusRef.current !== 'terminated') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleWindowBlur);
        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('copy', preventCopyPaste);
        document.addEventListener('paste', preventCopyPaste);
        document.addEventListener('contextmenu', preventContextMenu);
    }"""
)

content = content.replace(
"""  }, [attemptId, isPreviewMode, maxViolations, graceMs, onTerminate, onWarning]);""",
"""  }, [attemptId, isPreviewMode, maxViolations, graceMs, onTerminate, onWarning, status]);"""
)

with open("src/hooks/useProctoring.ts", "w") as f:
    f.write(content)

with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

content = content.replace(
"""  useProctoring({
    attemptId: attempt?.id || null,
    status,
    onTerminate: handleTerminate,
    isPreviewMode,
    onWarning: handleWarning
  });""",
"""  useProctoring({
    attemptId: attempt?.id || null,
    status,
    onTerminate: handleTerminate,
    isPreviewMode,
    onWarning: handleWarning,
    initialViolationCount: attempt?.violationCount ?? 0
  });"""
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
