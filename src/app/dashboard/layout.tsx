'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      if (pathname.startsWith('/dashboard/admin') && user.role !== 'admin') {
        router.replace(`/dashboard/${user.role}`);
      } else if (pathname.startsWith('/dashboard/teacher') && user.role !== 'teacher' && user.role !== 'admin') {
        router.replace(`/dashboard/${user.role}`);
      } else if (pathname.startsWith('/dashboard/student') && user.role !== 'student') {
        router.replace(`/dashboard/${user.role}`);
      }
    } else if (!loading && !user) {
        router.replace('/');
    }
  }, [user, loading, pathname, router]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white tracking-tight">Active Study</h1>
          <p className="text-sm text-slate-500 mt-1 capitalize">{user.role} Portal</p>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          {user.role === 'admin' && (
            <>
              <Link href="/dashboard/admin" className={`block px-4 py-2 rounded-md ${pathname === '/dashboard/admin' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white transition-colors'}`}>Admin Dashboard</Link>
              <Link href="/dashboard/teacher" className={`block px-4 py-2 rounded-md ${pathname.startsWith('/dashboard/teacher') ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white transition-colors'}`}>Teacher Tools</Link>
            </>
          )}
          {user.role === 'teacher' && (
            <>
              <Link href="/dashboard/teacher" className={`block px-4 py-2 rounded-md ${pathname === '/dashboard/teacher' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white transition-colors'}`}>Teacher Dashboard</Link>
              <Link href="/dashboard/teacher/importer" className={`block px-4 py-2 rounded-md ${pathname === '/dashboard/teacher/importer' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white transition-colors'}`}>Custom Importer</Link>
            </>
          )}
          {user.role === 'student' && (
            <>
              <Link href="/dashboard/student" className={`block px-4 py-2 rounded-md ${pathname === '/dashboard/student' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white transition-colors'}`}>Student Dashboard</Link>
            </>
          )}
        </nav>
        <div className="p-4 border-t border-slate-800">
            <div className="mb-4 px-2">
                <p className="text-sm text-white font-medium truncate">{user.displayName}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          <button onClick={signOut} className="w-full text-left px-4 py-2 rounded-md text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors text-sm font-medium">
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white shadow-sm px-6 py-4 border-b border-slate-200 sticky top-0 z-10 flex items-center justify-between">
             <h2 className="text-lg font-semibold text-slate-800 capitalize">
                {pathname.split('/').pop()?.replace('-', ' ') || 'Dashboard'}
             </h2>
        </header>
        <div className="flex-1 p-6 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
