export interface NavItem {
  href: string;
  label: string;
}

import { BarChart, Users, BookOpen, Settings, Layers } from 'lucide-react';

export const ADMIN_LINKS = [
  { href: '/dashboard/admin', i18nKey: 'nav.admin_overview', icon: BarChart },
  { href: '/dashboard/admin/users', i18nKey: 'nav.user_management', icon: Users },
  { href: '/dashboard/admin/groups', i18nKey: 'nav.admin_groups', icon: Layers },
  { href: '/dashboard/admin/exams', i18nKey: 'nav.exam_overview', icon: BookOpen },
  { href: '/dashboard/admin/settings', i18nKey: 'nav.platform_settings', icon: Settings },
];

export const NAV_ITEMS = {
  admin: [
    { href: '/dashboard/admin', i18nKey: 'nav.admin_dashboard' },
    { href: '/dashboard/teacher', i18nKey: 'nav.teacher_tools' },
    { href: '/dashboard/profile', i18nKey: 'nav.profile' },
  ],
  teacher: [
    { href: '/dashboard/teacher', i18nKey: 'nav.teacher_dashboard' },
    { href: '/dashboard/teacher/exams', i18nKey: 'nav.my_exams' },
    { href: '/dashboard/teacher/groups', i18nKey: 'nav.groups' },
    { href: '/dashboard/teacher/attempts', i18nKey: 'nav.attempts' },
    { href: '/dashboard/teacher/importer', i18nKey: 'nav.import' },
    { href: '/dashboard/profile', i18nKey: 'nav.profile' },
  ],
  student: [
    { href: '/dashboard/student', i18nKey: 'nav.student_dashboard' },
    { href: '/dashboard/profile', i18nKey: 'nav.profile' },
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
  '/dashboard/student': 'nav.student_dashboard',
  '/dashboard/teacher': 'nav.teacher_dashboard',
  '/dashboard/teacher/exams': 'nav.my_exams',
  '/dashboard/teacher/exams/create': 'common.create',
  '/dashboard/teacher/groups': 'nav.groups',
  '/dashboard/teacher/exam': 'common.edit',
  '/dashboard/teacher/attempts': 'nav.attempts',
  '/dashboard/teacher/importer': 'nav.import',
  '/dashboard/admin': 'nav.admin_overview',
  '/dashboard/admin/users': 'nav.user_management',
  '/dashboard/admin/groups': 'nav.admin_groups',
  '/dashboard/admin/exams': 'nav.exam_overview',
  '/dashboard/admin/settings': 'nav.platform_settings',
  '/dashboard/profile': 'nav.profile'
};

export function getPageTitle(pathname: string, t: (key: string, defaultValue: string) => string): string {
  if (TITLE_MAP[pathname]) return t(TITLE_MAP[pathname], TITLE_MAP[pathname]);

  const parts = pathname.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (!lastPart) return t('nav.dashboard', 'Dashboard');
  return lastPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
