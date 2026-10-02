import { Suspense } from 'react';
import JoinClient from './JoinClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="text-center mt-20">Loading...</div>}>
      <JoinClient />
    </Suspense>
  );
}
