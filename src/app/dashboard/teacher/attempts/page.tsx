import { Suspense } from 'react';
import { AttemptsContent } from './AttemptsContent';

export default function AttemptsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse space-y-4">
      <div className="h-8 bg-slate-200 rounded w-1/4"></div>
      <div className="h-32 bg-slate-200 rounded"></div>
    </div>}>
      <AttemptsContent />
    </Suspense>
  );
}
