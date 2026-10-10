// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  MIN_WINDOW_SHARE,
  WindowMetrics,
  checkWindow,
  describeViolation,
  graceFor,
  guardedShortcut,
  isEditingText,
  newWindowWatch,
  reasonForCause,
  windowShare,
} from './examGuard';

// Numbers as real browsers report them.
const phone: WindowMetrics = { outerWidth: 412, outerHeight: 780, innerWidth: 412, innerHeight: 780, availWidth: 412, availHeight: 915, devicePixelRatio: 2.6 };
const phoneSplitTop: WindowMetrics = { ...phone, outerHeight: 380, innerHeight: 380 };
const phoneSplitSmall: WindowMetrics = { ...phone, outerHeight: 280, innerHeight: 280 };
const desktop: WindowMetrics = { outerWidth: 1936, outerHeight: 1048, innerWidth: 1920, innerHeight: 937, availWidth: 1920, availHeight: 1040, devicePixelRatio: 1 };
const desktopHalf: WindowMetrics = { ...desktop, outerWidth: 968, innerWidth: 952 };
const desktopSmallWindow: WindowMetrics = { ...desktop, outerWidth: 1280, outerHeight: 760, innerWidth: 1264, innerHeight: 650 };

describe('windowShare', () => {
  it('is about 1 for a maximized desktop window and about 0.8 for a phone with browser bars', () => {
    expect(windowShare(desktop)).toBeGreaterThan(0.95);
    const share = windowShare(phone)!;
    expect(share).toBeGreaterThan(0.8);
    expect(share).toBeLessThan(0.9);
  });

  it('halves when the screen is split', () => {
    expect(windowShare(phoneSplitTop)!).toBeLessThan(0.45);
    expect(windowShare(desktopHalf)!).toBeCloseTo(0.5, 1);
  });

  it('does not change when the phone is turned', () => {
    const turned: WindowMetrics = { ...phone, outerWidth: 780, outerHeight: 412, innerWidth: 780, innerHeight: 412, availWidth: 915, availHeight: 412 };
    expect(windowShare(turned)).toBeCloseTo(windowShare(phone)!, 5);
  });

  it('says nothing when the browser reports no sizes', () => {
    expect(windowShare({ ...phone, availWidth: 0 })).toBeNull();
    expect(windowShare({ ...phone, outerWidth: 0, innerWidth: 0 })).toBeNull();
    expect(windowShare({ ...phone, availHeight: NaN })).toBeNull();
  });

  it('uses the viewport when the outer size is missing or smaller (some in-app browsers report 0)', () => {
    expect(windowShare({ ...phone, outerWidth: 0, outerHeight: 0 })).toBeCloseTo(windowShare(phone)!, 5);
  });
});

describe('checkWindow', () => {
  it('lets a normal phone and a maximized desktop window be', () => {
    expect(checkWindow(newWindowWatch(), phone).shrunk).toBe(false);
    expect(checkWindow(newWindowWatch(), desktop).shrunk).toBe(false);
  });

  it('catches an exam that is opened in half of a split screen from the start', () => {
    expect(checkWindow(newWindowWatch(), phoneSplitTop).shrunk).toBe(true);
    expect(checkWindow(newWindowWatch(), desktopHalf).shrunk).toBe(true);
  });

  it('catches a window that is small compared with the screen', () => {
    expect(windowShare(desktopSmallWindow)!).toBeLessThan(MIN_WINDOW_SHARE);
    expect(checkWindow(newWindowWatch(), desktopSmallWindow).shrunk).toBe(true);
  });

  it('catches a window made smaller after the start, even when still big on the screen', () => {
    const started = checkWindow(newWindowWatch(), desktop);
    const shrunk: WindowMetrics = { ...desktop, outerWidth: 1500, innerWidth: 1484 }; // share 0.78 of the screen
    expect(windowShare(shrunk)!).toBeGreaterThan(MIN_WINDOW_SHARE);
    expect(checkWindow(started.watch, shrunk).shrunk).toBe(true);
  });

  it('is calm again once the window is big again', () => {
    let state = checkWindow(newWindowWatch(), phone);
    state = checkWindow(state.watch, phoneSplitTop);
    expect(state.shrunk).toBe(true);
    state = checkWindow(state.watch, phone);
    expect(state.shrunk).toBe(false);
  });

  it('is not fooled by the bars of a phone browser hiding and showing', () => {
    let state = checkWindow(newWindowWatch(), { ...phone, innerHeight: 850, outerHeight: 850 }); // bars hidden while scrolling
    state = checkWindow(state.watch, phone); // bars back: 780 of 850
    expect(state.shrunk).toBe(false);
  });

  it('is not fooled by browser zoom (the page gets fewer CSS pixels, but the same device pixels)', () => {
    const start = checkWindow(newWindowWatch(), desktop);
    const zoomed: WindowMetrics = {
      outerWidth: 968, outerHeight: 524, innerWidth: 960, innerHeight: 468, availWidth: 960, availHeight: 520, devicePixelRatio: 2,
    };
    expect(checkWindow(start.watch, zoomed).shrunk).toBe(false);
  });

  it('measures again on another monitor instead of comparing with the first one', () => {
    const big = checkWindow(newWindowWatch(), { ...desktop, availLeft: 0, availTop: 0 });
    const laptop: WindowMetrics = { outerWidth: 1366, outerHeight: 728, innerWidth: 1366, innerHeight: 625, availWidth: 1366, availHeight: 728, devicePixelRatio: 1, availLeft: 1920, availTop: 0 };
    expect(checkWindow(big.watch, laptop).shrunk).toBe(false);
  });

  it('is not fooled by a browser that reports the size of the window as the size of the screen', () => {
    // headless and some mobile browsers: the "screen" follows the window, so only the drop from the start shows
    const started = checkWindow(newWindowWatch(), { ...phone, availHeight: 780 });
    const split: WindowMetrics = { ...phoneSplitTop, availHeight: 380 };
    expect(windowShare(split)).toBeCloseTo(1, 5);
    expect(checkWindow(started.watch, split).shrunk).toBe(true);
  });

  it('ignores the height lost to an on-screen keyboard while a text field is edited', () => {
    const start = checkWindow(newWindowWatch(), phone);
    const withKeyboard: WindowMetrics = { ...phone, outerHeight: 420, innerHeight: 420 };
    expect(checkWindow(start.watch, withKeyboard, { editing: true }).shrunk).toBe(false);
    expect(checkWindow(start.watch, withKeyboard).shrunk).toBe(true);
  });

  it('concludes nothing from numbers it cannot use', () => {
    expect(checkWindow(newWindowWatch(), { ...phone, availWidth: 0, availHeight: 0, innerWidth: 0, innerHeight: 0, outerWidth: 0, outerHeight: 0 }).shrunk).toBe(false);
  });

  it('a small window does not become the new normal', () => {
    let state = checkWindow(newWindowWatch(), phone);
    for (let i = 0; i < 5; i++) state = checkWindow(state.watch, phoneSplitSmall);
    expect(state.shrunk).toBe(true);
  });
});

describe('guardedShortcut', () => {
  const key = (init: Partial<Parameters<typeof guardedShortcut>[0]>) =>
    guardedShortcut({ key: '', code: '', metaKey: false, ctrlKey: false, shiftKey: false, ...init });

  it('sees Print Screen, with or without a modifier', () => {
    expect(key({ key: 'PrintScreen', code: 'PrintScreen' })).toBe('screenshot_key');
    expect(key({ key: 'PrintScreen', ctrlKey: true })).toBe('screenshot_key');
    expect(key({ code: 'PrintScreen' })).toBe('screenshot_key');
  });

  it('sees the snipping and Mac screenshot shortcuts', () => {
    expect(key({ metaKey: true, shiftKey: true, key: 's', code: 'KeyS' })).toBe('screenshot_key');
    expect(key({ metaKey: true, shiftKey: true, key: '#', code: 'Digit3' })).toBe('screenshot_key');
    expect(key({ metaKey: true, shiftKey: true, key: '$', code: 'Digit4' })).toBe('screenshot_key');
    expect(key({ metaKey: true, shiftKey: true, key: '%', code: 'Digit5' })).toBe('screenshot_key');
  });

  it('sees printing', () => {
    expect(key({ ctrlKey: true, key: 'p', code: 'KeyP' })).toBe('print_attempt');
    expect(key({ metaKey: true, key: 'P', code: 'KeyP' })).toBe('print_attempt');
  });

  it('leaves ordinary keys and shortcuts alone', () => {
    expect(key({ key: 'a', code: 'KeyA' })).toBeNull();
    expect(key({ key: 's', code: 'KeyS' })).toBeNull();
    expect(key({ shiftKey: true, key: 'S', code: 'KeyS' })).toBeNull();
    expect(key({ ctrlKey: true, key: 'c', code: 'KeyC' })).toBeNull();
    expect(key({ metaKey: true, shiftKey: true, key: 'p', code: 'KeyP' })).toBeNull();
    expect(key({ key: 'Enter', code: 'Enter' })).toBeNull();
  });
});

describe('isEditingText', () => {
  const el = (html: string) => {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    return holder.firstElementChild;
  };

  it('is true for text fields and false for the radio buttons of the exam', () => {
    expect(isEditingText(el('<textarea></textarea>'))).toBe(true);
    expect(isEditingText(el('<input type="text">'))).toBe(true);
    expect(isEditingText(el('<input>'))).toBe(true);
    expect(isEditingText(el('<input type="radio">'))).toBe(false);
    expect(isEditingText(el('<input type="checkbox">'))).toBe(false);
    expect(isEditingText(el('<button></button>'))).toBe(false);
    expect(isEditingText(null)).toBe(false);
  });
});

describe('violation texts and grace', () => {
  it('describes the reasons for the teacher and keeps unknown ones as they are', () => {
    expect(describeViolation('window_resized')).toMatch(/split|small/i);
    expect(describeViolation('screenshot_key')).toMatch(/screenshot/i);
    expect(describeViolation('left_exam_area')).toMatch(/left/i);
    expect(describeViolation('something_old')).toBe('something_old');
    expect(describeViolation(undefined)).toBe('');
  });

  it('gives more time to fix the window than to come back to the page', () => {
    expect(graceFor('hidden', 3000)).toBe(3000);
    expect(graceFor('unfocused', 3000)).toBe(3000);
    expect(graceFor('shrunk', 3000)).toBe(8000);
    expect(graceFor('shrunk', 20000)).toBe(20000);
  });

  it('keeps the old name for leaving the page', () => {
    expect(reasonForCause('hidden')).toBe('left_exam_area');
    expect(reasonForCause('unfocused')).toBe('focus_lost');
    expect(reasonForCause('shrunk')).toBe('window_resized');
  });
});
