/** Saves text as a file through the browser (works offline: nothing is fetched). */
export function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A title made safe for a file name on any system, keeping letters of every alphabet. */
export function safeFileName(title: string, extension = 'txt'): string {
  const base = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'test'}.${extension}`;
}
