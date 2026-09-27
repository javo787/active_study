import { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white shadow-sm px-6 py-4">
        <h1 className="text-xl font-bold text-slate-800">Active Study - Admin Portal</h1>
      </header>
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  );
}
