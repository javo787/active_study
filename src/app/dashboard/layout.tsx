'use client';

import { ReactNode, useEffect, useState, useRef } from 'react';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS, getPageTitle } from '@/lib/nav';
import ProfileSetup from '@/components/ProfileSetup';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const rawPathname = usePathname();
  const pathname = rawPathname.endsWith('/') && rawPathname.length > 1 ? rawPathname.slice(0, -1) : rawPathname;
  const router = useRouter();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Authentication & Role redirection
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

  // Drawer behavior
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [drawerOpen]);

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
      drawerRef.current?.focus();
    } else {
      document.body.style.overflow = '';
      if (document.activeElement === document.body || !document.activeElement) {
         burgerRef.current?.focus();
      }
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawerOpen]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const navItems = NAV_ITEMS[user.role as keyof typeof NAV_ITEMS] || [];
  const needsProfileSetup = user.role === 'student' && !user.fullName;

  return (
    <div className="h-dvh flex flex-col md:flex-row overflow-hidden bg-slate-50">

      {/* Mobile Top Bar */}
      <header className="md:hidden bg-white shadow-sm border-b border-slate-200 pt-safe shrink-0">
        <div className="h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              ref={burgerRef}
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              aria-controls="mobile-drawer"
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-semibold text-slate-800 truncate">
               {getPageTitle(pathname)}
            </h2>
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
             {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'}
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-opacity duration-200 ${drawerOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
      >
         <div
           className="absolute inset-0 bg-slate-900/50 transition-opacity"
           onClick={() => setDrawerOpen(false)}
           aria-hidden="true"
         />
         <div
           id="mobile-drawer"
           role="dialog"
           aria-modal="true"
           ref={drawerRef}
           tabIndex={-1}
           className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-900 text-slate-300 flex flex-col transform transition-transform duration-200 ease-in-out motion-reduce:transition-none outline-none ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
         >
           <div className="p-4 border-b border-slate-800 flex items-center justify-between min-h-[56px] pt-safe">
             <div>
               <h1 className="text-xl font-bold text-white tracking-tight">Active Study</h1>
               <p className="text-sm text-slate-500 mt-1 capitalize">{user.role} Portal</p>
             </div>
             <button
               onClick={() => setDrawerOpen(false)}
               className="p-2 -mr-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center"
               aria-label="Close menu"
             >
               <X className="w-6 h-6" />
             </button>
           </div>

           <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setDrawerOpen(false)}
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

           <div className="p-4 border-t border-slate-800 pb-safe">
              <div className="mb-4 px-2">
                  <p className="text-sm text-white font-medium truncate">{user.displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            <button onClick={signOut} className="w-full text-left px-4 py-2 min-h-[44px] rounded-md text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors text-sm font-medium">
              Sign Out
            </button>
          </div>
         </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-300 flex-col shrink-0">
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
