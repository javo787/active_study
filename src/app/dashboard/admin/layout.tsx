'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Settings, BookOpen, BarChart } from 'lucide-react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const adminLinks = [
    { href: '/dashboard/admin', label: 'Overview', icon: BarChart },
    { href: '/dashboard/admin/users', label: 'User Management', icon: Users },
    { href: '/dashboard/admin/exams', label: 'Exam Overview', icon: BookOpen },
    { href: '/dashboard/admin/settings', label: 'Platform Settings', icon: Settings },
  ];

  return (
    <div className="flex h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Secondary Admin Sidebar */}
      <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-100/50">
          <h3 className="font-semibold text-slate-800">Admin Controls</h3>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {adminLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Admin Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-white p-6">
        {children}
      </main>
    </div>
  );
}
