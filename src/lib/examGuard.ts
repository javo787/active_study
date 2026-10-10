/**
 * Rules that keep the questions of a proctored exam off a second window or a screenshot, without a browser or a
 * database (the side effects are in hooks/useProctoring.ts).
 *
 * A web page cannot stop a screenshot, and on a phone it cannot even see one. What it can do is notice the situations
 * in which a screenshot or a second window becomes possible: the window is split or made small, another window or
 * panel is on top of it, the page is hidden, a screenshot or print key is pressed. In all of them the questions are
 * covered at once and the teacher gets a line in the violation log.
 */

/** Why the questions were covered, and what the teacher reads in the violation log. */
export type GuardReason =
  | 'left_exam_area'
  | 'focus_lost'
  | 'window_resized'
  | 'screenshot_key'
  | 'print_attempt';

const LABELS: Record<GuardReason, string> = {
  left_exam_area: 'Left the exam page',
  focus_lost: 'Another window or panel was on top of the exam',
  window_resized: 'Made the window small or split the screen',
  screenshot_key: 'Pressed a screenshot key',
  print_attempt: 'Tried to print the exam',
};

/** Readable text for a stored reason; reasons written by older versions are shown as they are. */
export function describeViolation(reason: string | undefined | null): string {
  if (!reason) return '';
  return (LABELS as Record<string, string>)[reason] ?? reason;
}

/**
 * The window has to take at least this share of the screen's usable area. A phone with its browser bars is at about
 * 0.8 or more, a maximized desktop window at about 1, half of a split screen at 0.5 or less.
 */
export const MIN_WINDOW_SHARE = 0.6;

/** Smaller than this share of the biggest size seen since the exam started counts as "the window was made smaller". */
export const MIN_SHARE_OF_PEAK = 0.8;

export interface WindowMetrics {
  outerWidth: number;
  outerHeight: number;
  innerWidth: number;
  innerHeight: number;
  availWidth: number;
  availHeight: number;
  devicePixelRatio: number;
  /** Where the screen the window is on starts (non-standard, only where the browser has it): changes when the window moves to another monitor. */
  availLeft?: number;
  availTop?: number;
}

export interface WindowWatch {
  /** Biggest page area seen, in device pixels so that browser zoom does not change it. */
  peak: number;
  /** Which monitor and zoom `peak` belongs to; a new one starts a new measurement. The size of the screen is not part of it: some browsers report the size of the window there. */
  screenKey: string;
}

export function newWindowWatch(): WindowWatch {
  return { peak: 0, screenKey: '' };
}

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Share of the screen's usable area the browser window takes; null when the browser gives no usable numbers (some
 * in-app browsers report zeros), in which case nothing is concluded from it. Width times height, so turning the
 * phone does not change it.
 */
export function windowShare(m: WindowMetrics): number | null {
  const width = Math.max(positive(m.outerWidth), positive(m.innerWidth));
  const height = Math.max(positive(m.outerHeight), positive(m.innerHeight));
  const screenArea = positive(m.availWidth) * positive(m.availHeight);
  if (width === 0 || height === 0 || screenArea === 0) return null;
  return (width * height) / screenArea;
}

/**
 * Is the window split, floating or shrunk? Two checks: the window is small compared with the screen (this also
 * catches an exam opened in a half screen from the start), or it got clearly smaller than it was a moment ago.
 * `editing`: a text field has the keyboard open, which makes the page shorter on some phones and says nothing.
 */
export function checkWindow(
  watch: WindowWatch,
  m: WindowMetrics,
  { editing = false }: { editing?: boolean } = {},
): { shrunk: boolean; watch: WindowWatch } {
  if (editing) return { shrunk: false, watch };

  const dpr = positive(m.devicePixelRatio) || 1;
  const page = positive(m.innerWidth) * positive(m.innerHeight) * dpr * dpr;
  const screenKey = `${dpr}@${m.availLeft ?? 0},${m.availTop ?? 0}`;

  // Another monitor or zoom: measure again instead of comparing with the old one.
  const peak = watch.screenKey === screenKey ? Math.max(watch.peak, page) : page;
  const next: WindowWatch = { peak, screenKey };

  const share = windowShare(m);
  const smallOnScreen = share !== null && share < MIN_WINDOW_SHARE;
  const smallerThanBefore = page > 0 && peak > 0 && page < peak * MIN_SHARE_OF_PEAK;
  return { shrunk: smallOnScreen || smallerThanBefore, watch: next };
}

type KeyInfo = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey'>;

/**
 * Keys that take a screenshot (Print Screen with any modifier, Win+Shift+S, Cmd+Shift+3/4/5/6) or print the page
 * (Ctrl/Cmd+P). Many are handled by the system before the page sees them, so this is a best effort on computers.
 */
export function guardedShortcut(e: KeyInfo): 'screenshot_key' | 'print_attempt' | null {
  if (e.key === 'PrintScreen' || e.code === 'PrintScreen') return 'screenshot_key';
  if (e.metaKey && e.shiftKey && ['Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyS'].includes(e.code)) return 'screenshot_key';
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.code === 'KeyP' || e.key === 'p' || e.key === 'P')) return 'print_attempt';
  return null;
}

/** A text field is being edited (the on-screen keyboard may be open). */
export function isEditingText(el: Element | null | undefined): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['radio', 'checkbox', 'button', 'submit', 'range', 'file', 'color', 'image', 'reset'].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/** How long the page may stay away before it counts as a violation. Making the window the right size takes longer. */
export function graceFor(cause: 'hidden' | 'unfocused' | 'shrunk', baseMs: number): number {
  return cause === 'shrunk' ? Math.max(baseMs, 8000) : baseMs;
}

export function reasonForCause(cause: 'hidden' | 'unfocused' | 'shrunk'): GuardReason {
  if (cause === 'hidden') return 'left_exam_area';
  if (cause === 'unfocused') return 'focus_lost';
  return 'window_resized';
}
