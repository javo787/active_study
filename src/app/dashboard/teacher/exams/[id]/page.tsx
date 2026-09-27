export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: '1' }];
}

export default function ExamPage({ params }: { params: { id: string } }) {
  return <div>Exam details for {params.id}</div>;
}
