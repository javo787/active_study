// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateDoc = vi.fn(() => Promise.resolve());
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  updateDoc: (...args: unknown[]) => (updateDoc as (...a: unknown[]) => Promise<void>)(...args),
  increment: (n: number) => ({ increment: n }),
  serverTimestamp: () => ({ serverTimestamp: true }),
  arrayUnion: (v: unknown) => ({ arrayUnion: v }),
  Timestamp: { now: () => ({ now: true }) },
}));

import { useProctoring } from './useProctoring';

type Props = Parameters<typeof useProctoring>[0];

// A phone: 412x915 screen, browser window 412x780.
const PHONE = { innerWidth: 412, innerHeight: 780, outerWidth: 412, outerHeight: 780, availWidth: 412, availHeight: 915 };

function setWindow(sizes: Partial<typeof PHONE>) {
  const all = { ...PHONE, ...sizes };
  for (const key of ['innerWidth', 'innerHeight', 'outerWidth', 'outerHeight'] as const) {
    Object.defineProperty(window, key, { configurable: true, value: all[key] });
  }
  for (const key of ['availWidth', 'availHeight'] as const) {
    Object.defineProperty(window.screen, key, { configurable: true, value: all[key] });
  }
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2.6 });
}

let focused = true;
let visibility: DocumentVisibilityState = 'visible';

function fire(target: EventTarget, type: string, init?: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(type.startsWith('key') ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }) : new Event(type, { bubbles: true }));
  });
}

function mount(overrides: Partial<Props> = {}) {
  const onWarning = vi.fn();
  const onTerminate = vi.fn();
  const props: Props = {
    attemptId: 'a1',
    status: 'in_progress',
    maxViolations: 3,
    graceMs: 3000,
    onWarning,
    onTerminate,
    ...overrides,
  };
  const view = renderHook((current: Props) => useProctoring(current), { initialProps: props });
  return { ...view, props, onWarning, onTerminate };
}

function violationReasons(): string[] {
  return updateDoc.mock.calls.map(call => {
    const updates = (call as unknown as [unknown, { violations: { arrayUnion: { reason: string } } }])[1];
    return updates.violations.arrayUnion.reason;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  focused = true;
  visibility = 'visible';
  setWindow({});
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  vi.spyOn(window, 'focus').mockImplementation(() => {});
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  updateDoc.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useProctoring: the questions are covered while the exam cannot be taken properly', () => {
  it('stays out of the way in a normal window', () => {
    const { result } = mount();
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.covered).toBe(false);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('covers the questions at once when the screen is split, and counts it after the grace time', () => {
    const { result, onWarning } = mount();

    setWindow({ innerHeight: 380, outerHeight: 380 });
    fire(window, 'resize');
    expect(result.current.covered).toBe(true);
    expect(result.current.reason).toBe('window_resized');

    act(() => { vi.advanceTimersByTime(7_000); });
    expect(updateDoc).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1_500); });
    expect(violationReasons()).toEqual(['window_resized']);
    expect(onWarning).toHaveBeenCalledWith(1, 3, 'window_resized');
    expect(result.current.covered).toBe(true);

    // still split: one stretch is one violation
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(updateDoc).toHaveBeenCalledTimes(1);

    setWindow({});
    fire(window, 'resize');
    expect(result.current.covered).toBe(false);
  });

  it('does not count a window that was made small for a moment', () => {
    const { result } = mount();
    setWindow({ innerHeight: 380, outerHeight: 380 });
    fire(window, 'resize');
    expect(result.current.covered).toBe(true);
    act(() => { vi.advanceTimersByTime(4_000); });
    setWindow({});
    fire(window, 'resize');
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.covered).toBe(false);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('covers an exam that is opened in a split screen from the start', () => {
    setWindow({ innerHeight: 380, outerHeight: 380 });
    const { result } = mount();
    expect(result.current.covered).toBe(true);
    expect(result.current.reason).toBe('window_resized');
  });

  it('covers the questions when another window or panel takes the focus, also on a phone', () => {
    const { result, onWarning } = mount();
    focused = false;
    fire(window, 'blur');
    expect(result.current.covered).toBe(true);
    expect(result.current.reason).toBe('focus_lost');

    act(() => { vi.advanceTimersByTime(3_100); });
    expect(violationReasons()).toEqual(['focus_lost']);
    expect(onWarning).toHaveBeenCalledWith(1, 3, 'focus_lost');

    focused = true;
    fire(window, 'focus');
    expect(result.current.covered).toBe(false);
  });

  it('does not count a panel pulled down for a second', () => {
    const { result } = mount();
    focused = false;
    fire(window, 'blur');
    act(() => { vi.advanceTimersByTime(1_000); });
    focused = true;
    fire(window, 'focus');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.covered).toBe(false);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('notices a lost focus the browser did not announce (the safety poll)', () => {
    const { result } = mount();
    focused = false;
    act(() => { vi.advanceTimersByTime(1_100); });
    expect(result.current.covered).toBe(true);
  });

  it('does not trust the focus when the browser never reported it', () => {
    focused = false; // an in-app browser that always says "no focus"
    const { result } = mount();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.covered).toBe(false);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('keeps the old name for leaving the page, and counts it once', () => {
    const { result } = mount();
    visibility = 'hidden';
    focused = false;
    fire(document, 'visibilitychange');
    expect(result.current.covered).toBe(true);
    expect(result.current.reason).toBe('left_exam_area');

    act(() => { vi.advanceTimersByTime(3_100); });
    expect(violationReasons()).toEqual(['left_exam_area']);

    visibility = 'visible';
    focused = true;
    fire(document, 'visibilitychange');
    expect(result.current.covered).toBe(false);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it('covers the questions and counts at once when a screenshot key is pressed, then uncovers', () => {
    const { result, onWarning } = mount();
    fire(window, 'keyup', { key: 'PrintScreen', code: 'PrintScreen' });
    expect(result.current.covered).toBe(true);
    expect(result.current.reason).toBe('screenshot_key');
    expect(violationReasons()).toEqual(['screenshot_key']);
    expect(onWarning).toHaveBeenCalledWith(1, 3, 'screenshot_key');

    // the same press arrives as keydown and keyup, and may repeat
    fire(window, 'keydown', { key: 'PrintScreen', code: 'PrintScreen' });
    fire(window, 'keyup', { key: 'PrintScreen', code: 'PrintScreen' });
    expect(updateDoc).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(2_600); });
    expect(result.current.covered).toBe(false);
  });

  it('stops printing and counts it', () => {
    const { result } = mount();
    const event = new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.reason).toBe('print_attempt');
    expect(violationReasons()).toEqual(['print_attempt']);
  });

  it('stops the exam when the warnings run out', () => {
    const { onTerminate } = mount({ maxViolations: 2, initialViolationCount: 1 });
    fire(window, 'keyup', { key: 'PrintScreen', code: 'PrintScreen' });
    expect(onTerminate).toHaveBeenCalledWith('screenshot_key');
    const updates = (updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(updates.status).toBe('flagged');
  });

  it('does nothing in preview mode, with proctoring off, or without an attempt', () => {
    for (const overrides of [{ isPreviewMode: true }, { enabled: false }, { attemptId: null }] as Partial<Props>[]) {
      cleanup();
      updateDoc.mockClear();
      setWindow({ innerHeight: 380, outerHeight: 380 });
      const { result } = mount(overrides);
      fire(window, 'keyup', { key: 'PrintScreen', code: 'PrintScreen' });
      act(() => { vi.advanceTimersByTime(20_000); });
      expect(result.current.covered).toBe(false);
      expect(updateDoc).not.toHaveBeenCalled();
    }
  });

  it('uncovers when the exam is over', () => {
    const { result, rerender, props } = mount();
    setWindow({ innerHeight: 380, outerHeight: 380 });
    fire(window, 'resize');
    expect(result.current.covered).toBe(true);
    rerender({ ...props, status: 'completed' });
    expect(result.current.covered).toBe(false);
  });

  it('the "back to the exam" button looks at the window again', () => {
    const { result } = mount();
    setWindow({ innerHeight: 380, outerHeight: 380 });
    fire(window, 'resize');
    expect(result.current.covered).toBe(true);
    setWindow({});
    act(() => { result.current.recheck(); });
    expect(result.current.covered).toBe(false);
  });

  it('still blocks copy, paste and the context menu', () => {
    mount();
    for (const type of ['copy', 'paste', 'contextmenu']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      act(() => { document.dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(true);
    }
  });
});
