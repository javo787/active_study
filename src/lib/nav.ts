import { BarChart, BookOpen, Settings, Users, FileDown, PlusCircle, ClipboardList, Book } from 'lucide-react';

export const ADMIN_LINKS = [
  { href: '/dashboard/admin', label: 'Overview', icon: BarChart },
  { href: '/dashboard/admin/users', label: 'User Management', icon: Users },
  { href: '/dashboard/admin/exams', label: 'Exam Overview', icon: BookOpen },
  { href: '/dashboard/admin/settings', label: 'Platform Settings', icon: Settings },
];

export const NAV_BY_ROLE = {
  admin: [
    { label: 'Admin Dashboard', href: '/dashboard/admin', icon: Settings, exact: true },
    { label: 'Teacher Tools', href: '/dashboard/teacher', icon: BookOpen, exact: false },
  ],
  teacher: [
    { label: 'Teacher Dashboard', href: '/dashboard/teacher', icon: BarChart, exact: true },
    { label: 'Custom Importer', href: '/dashboard/teacher/importer', icon: FileDown, exact: true },
    { label: 'Create Exam', href: '/dashboard/teacher/exams/create', icon: PlusCircle, exact: true },
    { label: 'Attempts', href: '/dashboard/teacher/attempts', icon: ClipboardList, exact: true },
  ],
  student: [
    { label: 'Student Dashboard', href: '/dashboard/student', icon: Book, exact: true },
  ],
};

export function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard/admin') return 'Admin Dashboard';
  if (pathname === '/dashboard/admin/users') return 'User Management';
  if (pathname === '/dashboard/admin/exams') return 'Exam Overview';
  if (pathname === '/dashboard/admin/settings') return 'Platform Settings';

  if (pathname === '/dashboard/teacher') return 'Teacher Dashboard';
  if (pathname === '/dashboard/teacher/importer') return 'Custom Importer';
  if (pathname === '/dashboard/teacher/exams/create') return 'Create Exam';
  if (pathname === '/dashboard/teacher/attempts') return 'Attempts';

  if (pathname === '/dashboard/student') return 'Student Dashboard';

  if (pathname.startsWith('/dashboard/teacher/exams/')) return 'Exam Details';

  return pathname.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Dashboard';
}
