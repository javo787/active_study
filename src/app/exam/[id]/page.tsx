import ExamTakingInterface from './ExamClient';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: '1' }];
}

export default function Page({ params }: { params: { id: string } }) {
  return <ExamTakingInterface params={params} />;
}
