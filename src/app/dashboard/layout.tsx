'use client';

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS, getPageTitle } from '@/lib/nav';
import ProfileSetup from '@/components/ProfileSetup';

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

  const navItems = NAV_ITEMS[user.role as keyof typeof NAV_ITEMS] || [];
  const needsProfileSetup = user.role === 'student' && !user.fullName;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white tracking-tight">Active Study</h1>
          <p className="text-sm text-slate-500 mt-1 capitalize">{user.role} Portal</p>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-3 min-h-[44px] rounded-md ${
                (pathname === item.href)
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-800 hover:text-white transition-colors'
              }`}
            >
              {item.label}
            </Link>
          ))}
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
        <header className="bg-white shadow-sm px-6 py-4 min-h-[60px] border-b border-slate-200 sticky top-0 z-10 flex items-center justify-between">
             <h2 className="text-lg font-semibold text-slate-800">
                {getPageTitle(pathname)}
             </h2>
        </header>
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          {needsProfileSetup ? <ProfileSetup /> : children}
        </div>
      </main>
    </div>
  );
}
