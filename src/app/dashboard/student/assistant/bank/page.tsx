import { Suspense } from 'react';
import BankLoader from './BankLoader';

export default function Page() {
  return (
    <Suspense fallback={<div className="h-24 bg-slate-200 rounded-xl animate-pulse" aria-busy="true" />}>
      <BankLoader />
    </Suspense>
  );
}
