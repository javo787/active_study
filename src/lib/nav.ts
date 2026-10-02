export interface NavItem {
  href: string;
  label: string;
}

import { BarChart, Users, BookOpen, Settings } from 'lucide-react';

export const ADMIN_LINKS = [
  { href: '/dashboard/admin', label: 'Overview', icon: BarChart },
  { href: '/dashboard/admin/users', label: 'User Management', icon: Users },
  { href: '/dashboard/admin/exams', label: 'Exam Overview', icon: BookOpen },
  { href: '/dashboard/admin/settings', label: 'Platform Settings', icon: Settings },
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
    { href: '/dashboard/teacher/groups', label: 'Groups' },
    { href: '/dashboard/teacher/attempts', label: 'Attempts' },
    { href: '/dashboard/teacher/importer', label: 'Import' },
    { href: '/dashboard/profile', label: 'Profile' },
  ],
  student: [
    { href: '/dashboard/student', label: 'Student Dashboard' },
    { href: '/dashboard/profile', label: 'Profile' },
  ]
} as const;

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard/admin' || href === '/dashboard/teacher' || href === '/dashboard/student') {
    return pathname === href;
  }
  if (href === '/dashboard/teacher/exams' && pathname === '/dashboard/teacher/exam') {
    return true;
  }
  return pathname.startsWith(href + '/') || pathname === href;
}

const TITLE_MAP: Record<string, string> = {
  '/dashboard/student': 'Exams',
  '/dashboard/teacher': 'Dashboard',
  '/dashboard/teacher/exams': 'My Exams',
  '/dashboard/teacher/exams/create': 'New Exam',
  '/dashboard/teacher/groups': 'Groups',
  '/dashboard/teacher/exam': 'Manage Exam',
  '/dashboard/teacher/attempts': 'Attempts',
  '/dashboard/teacher/importer': 'Import Test',
  '/dashboard/admin': 'Admin Overview',
  '/dashboard/admin/users': 'User Management',
  '/dashboard/admin/exams': 'Exam Overview',
  '/dashboard/admin/settings': 'Platform Settings',
  '/dashboard/profile': 'Profile'
};

export function getPageTitle(pathname: string): string {
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname];

  const parts = pathname.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (!lastPart) return 'Dashboard';
  return lastPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
