import Link from 'next/link';

export default function AdminDashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Import Legacy Test</h3>
          <p className="text-slate-500 mb-4">Upload and parse text files to create exams with variants.</p>
          <Link href="/admin/importer" className="text-blue-600 hover:underline">
            Go to Importer &rarr;
          </Link>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Manage Exams</h3>
          <p className="text-slate-500 mb-4">Create, edit, and publish exams manually.</p>
          <Link href="/admin/exams/create" className="text-blue-600 hover:underline">
            Create New Exam &rarr;
          </Link>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-700 mb-2">View Attempts</h3>
          <p className="text-slate-500 mb-4">Review student attempts and proctoring logs.</p>
          <Link href="/admin/attempts" className="text-blue-600 hover:underline">
            View All Attempts &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
