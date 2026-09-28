export interface NavItem {
  href: string;
  label: string;
}

import { Shield, Users, FileText, Database } from 'lucide-react';

export const ADMIN_LINKS = [
  { href: '/dashboard/admin', label: 'Overview', icon: Shield },
  { href: '/dashboard/admin/users', label: 'Users', icon: Users },
  { href: '/dashboard/admin/exams', label: 'Exams', icon: FileText },
  { href: '/dashboard/admin/attempts', label: 'Attempts', icon: Database },
];

export const NAV_ITEMS = {
  admin: [
    { href: '/dashboard/admin', label: 'Admin Dashboard' },
    { href: '/dashboard/teacher', label: 'Teacher Tools' },
    { href: '/dashboard/profile', label: 'Profile' },
  ],
  teacher: [
    { href: '/dashboard/teacher', label: 'Dashboard' },
    { href: '/dashboard/teacher/exams', label: 'My Exams' },
    { href: '/dashboard/teacher/attempts', label: 'Attempts' },
    { href: '/dashboard/teacher/importer', label: 'Import' },
    { href: '/dashboard/profile', label: 'Profile' },
  ],
  student: [
    { href: '/dashboard/student', label: 'Student Dashboard' },
    { href: '/dashboard/profile', label: 'Profile' },
  ]
} as const;

export function getPageTitle(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (!lastPart) return 'Dashboard';
  return lastPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
