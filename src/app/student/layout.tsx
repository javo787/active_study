import { ReactNode } from 'react';

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* We conditionally hide header in exam mode based on url or state inside the exam page */}
      <header className="bg-white shadow-sm px-6 py-4" id="student-header">
        <h1 className="text-xl font-bold text-slate-800">Active Study - Student Dashboard</h1>
      </header>
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  );
}
