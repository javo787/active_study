export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS = {
  admin: [
    { href: '/dashboard/admin', label: 'Admin Dashboard' },
    { href: '/dashboard/teacher', label: 'Teacher Tools' },
    { href: '/dashboard/profile', label: 'Profile' },
  ],
  teacher: [
    { href: '/dashboard/teacher', label: 'Teacher Dashboard' },
    { href: '/dashboard/teacher/importer', label: 'Custom Importer' },
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
