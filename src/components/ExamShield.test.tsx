// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initTestI18n } from '@/test/i18n';
import ExamShield from './ExamShield';
import ExamWatermark, { watermarkTile } from './ExamWatermark';

initTestI18n();
afterEach(cleanup);

describe('ExamShield', () => {
  it('tells the student why the exam is hidden and what to do', () => {
    render(<ExamShield reason="window_resized" onResume={() => {}} />);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('The exam is hidden')).toBeTruthy();
    expect(screen.getByText(/window is small or the screen is split/i)).toBeTruthy();
    expect(screen.getByText(/recorded/i)).toBeTruthy();
  });

  it.each([
    ['left_exam_area', /left the exam page/i],
    ['focus_lost', /another window or panel/i],
    ['screenshot_key', /screenshot key/i],
    ['print_attempt', /printing the exam/i],
  ] as const)('has its own text for %s', (reason, text) => {
    render(<ExamShield reason={reason} onResume={() => {}} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('falls back to the "left the page" text without a reason', () => {
    render(<ExamShield reason={null} onResume={() => {}} />);
    expect(screen.getByText(/left the exam page/i)).toBeTruthy();
  });

  it('the button asks to look at the window again', async () => {
    const onResume = vi.fn();
    render(<ExamShield reason="focus_lost" onResume={onResume} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the exam' }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});

describe('ExamWatermark', () => {
  it('draws the name as a repeating faint pattern that takes no clicks', () => {
    render(<ExamWatermark text="Анна Петрова · a1b2c3" />);
    const mark = screen.getByTestId('exam-watermark');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.className).toContain('pointer-events-none');
    expect(mark.style.backgroundImage).toContain('data:image/svg+xml');
    expect(decodeURIComponent(mark.style.backgroundImage)).toContain('Анна Петрова · a1b2c3');
  });

  it('draws nothing for an empty name', () => {
    const { container } = render(<ExamWatermark text="   " />);
    expect(container.firstChild).toBeNull();
  });

  it('cannot be broken out of by a name with markup in it', () => {
    const tile = watermarkTile('</text><script>alert(1)</script> "&\'');
    expect(tile).not.toContain('<script>');
    expect(tile).toContain('&lt;/text&gt;');
    expect(tile).toContain('&amp;');
    expect(tile).toContain('&quot;');
    expect(tile.match(/<text /g)).toHaveLength(1);
  });

  it('keeps a long name to one tile', () => {
    const tile = watermarkTile('Я'.repeat(200));
    expect(tile.match(/Я/g)!.length).toBeLessThanOrEqual(40);
  });
});
