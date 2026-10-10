import React from 'react';

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** One tile of the pattern: the text slanted, centered, faint. Exported for the test. */
export function watermarkTile(text: string): string {
  const label = escapeXml(text.trim().slice(0, 40));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200">` +
    `<text x="180" y="100" text-anchor="middle" dominant-baseline="middle" transform="rotate(-24 180 100)" ` +
    `font-family="sans-serif" font-size="14" font-weight="600" fill="#0f172a" fill-opacity="0.075">${label}</text>` +
    `</svg>`
  );
}

/**
 * The student's name over the whole exam, faint but readable on a screenshot. A page cannot prevent a photo or a
 * screenshot from the phone's own buttons; this makes sure whoever shares one is known. It does not take clicks and is
 * hidden from screen readers.
 */
export default function ExamWatermark({ text }: { text: string }) {
  if (!text.trim()) return null;
  const image = `url("data:image/svg+xml,${encodeURIComponent(watermarkTile(text))}")`;

  return (
    <div
      aria-hidden="true"
      data-testid="exam-watermark"
      className="exam-no-print pointer-events-none fixed inset-0 z-[60] select-none"
      style={{ backgroundImage: image, backgroundRepeat: 'repeat' }}
    />
  );
}
