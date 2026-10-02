// The app is mounted under duxtur.org/edu in production (NEXT_PUBLIC_BASE_PATH=/edu).
// Standalone builds leave it empty. next/link and the router add the prefix by themselves;
// absolute URLs that we build by hand (links teachers share with students) must add it.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** Absolute URL of an app page, e.g. appUrl('/exam?id=abc') -> https://duxtur.org/edu/exam?id=abc */
export function appUrl(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${BASE_PATH}${path}`;
}
