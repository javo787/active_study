import { Suspense } from 'react';
import ExamTakingInterface from './ExamClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="text-center mt-20">Loading exam...</div>}>
      <ExamTakingInterface />
    </Suspense>
  );
}
