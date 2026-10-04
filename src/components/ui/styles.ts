// Shared class strings for the redesigned screens. One radius scale: controls 8px, surfaces 12px, pills full.
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

export const surface = 'bg-white border border-slate-200 rounded-xl';

export const btn = `inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focus}`;
export const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700`;
export const btnQuiet = `${btn} bg-white text-slate-700 border border-slate-300 hover:bg-slate-50`;
export const btnGhost = `${btn} text-slate-600 hover:bg-slate-100`;

export const field = `w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-ink min-h-[44px] placeholder:text-slate-400 ${focus}`;
export const fieldLabel = 'block text-sm font-medium text-slate-700 mb-1';
