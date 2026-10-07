'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Eye, ExternalLink, Globe, Hourglass, LogIn, Newspaper, PenLine, ShieldX, Stethoscope, Pencil } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { btn, btnPrimary, btnQuiet, surface } from '@/components/ui/styles';
import { DUXTUR_HOSTS } from '@/lib/telegramAuth';
import {
  DoctorArticle,
  PortalSession,
  articleAccess,
  fetchDoctorArticles,
  fetchPortalSession,
  formatArticleDate,
  formatCount,
  linkState,
  portalPath,
} from '@/lib/portalAccount';

// A teacher at a medical university is a doctor: articles are written through the doctor cabinet on duxtur.org,
// under the doctor profile that the portal team verified. This page is the way in from Edu and the list of what
// the teacher has written; it never touches an article itself. Everything here is plain <a> because the portal
// pages are outside Edu's /edu base path (next/link would prefix them).

const OFF_PORTAL_URL = 'https://duxtur.org/edu/dashboard/teacher/articles';

type View = { kind: 'loading' } | { kind: 'off_portal' } | { kind: 'ready'; portal: PortalSession };

export default function TeacherArticles() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    if (!DUXTUR_HOSTS.includes(window.location.hostname)) {
      setView({ kind: 'off_portal' });
      return;
    }
    fetchPortalSession().then(portal => {
      if (alive) setView({ kind: 'ready', portal });
    });
    return () => {
      alive = false;
    };
  }, []);

  const access = view.kind === 'ready' ? articleAccess(view.portal) : null;
  const portal = view.kind === 'ready' ? view.portal : null;

  return (
    <div className="max-w-3xl space-y-6 pb-10">
      <PageHeader
        title={t('nav.articles')}
        description={t('articles.intro')}
        actions={
          access === 'approved' ? (
            <a href={portalPath(lang, '/admin?tab=write')} className={`${btnPrimary} flex-1 sm:flex-none`}>
              <PenLine className="w-4 h-4" aria-hidden="true" />
              {t('articles.write')}
            </a>
          ) : undefined
        }
      />

      {view.kind === 'loading' && (
        <div role="status" aria-label={t('articles.checking')} className="space-y-3">
          <div className="h-28 bg-slate-200 rounded-xl animate-pulse" />
          <span className="sr-only">{t('articles.checking')}</span>
        </div>
      )}

      {view.kind === 'off_portal' && (
        <Notice icon={<Globe className="w-5 h-5" />} title={t('articles.off_portal_title')} body={t('articles.off_portal_body')}>
          <a href={OFF_PORTAL_URL} className={btnPrimary}>
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            {t('articles.off_portal_action')}
          </a>
        </Notice>
      )}

      {access === 'not_signed_in' && (
        <Notice icon={<LogIn className="w-5 h-5" />} title={t('articles.sign_in_title')} body={t('articles.sign_in_body')}>
          <a href={portalPath(lang, '/login')} className={btnPrimary}>
            {t('articles.sign_in_action')}
          </a>
        </Notice>
      )}

      {access === 'no_profile' && (
        <Notice icon={<Stethoscope className="w-5 h-5" />} title={t('articles.no_profile_title')} body={t('articles.no_profile_body')}>
          <a href={portalPath(lang, '/register')} className={btnPrimary}>
            {t('articles.no_profile_action')}
          </a>
        </Notice>
      )}

      {access === 'pending' && (
        <Notice icon={<Hourglass className="w-5 h-5" />} title={t('articles.pending_title')} body={t('articles.pending_body')} />
      )}

      {access === 'rejected' && (
        <Notice icon={<ShieldX className="w-5 h-5" />} title={t('articles.rejected_title')} body={t('articles.rejected_body')} tone="flag" />
      )}

      {portal?.signedIn && user && linkState(portal, user.uid) === 'linkable' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-blue-900 flex-1">{t('articles.link_hint')}</p>
          <Link href="/dashboard/profile" className={`${btnQuiet} shrink-0`}>
            {t('articles.link_action')}
          </Link>
        </div>
      )}

      {portal?.signedIn && access === 'approved' && (
        <>
          <p className="text-sm text-slate-500">
            {t('articles.signed_in_as', { name: portal.name || portal.email })}
          </p>
          <ArticleList lang={lang} />
        </>
      )}
    </div>
  );
}

function Notice({ icon, title, body, tone = 'info', children }: { icon: ReactNode; title: string; body: string; tone?: 'info' | 'flag'; children?: ReactNode }) {
  const iconBox = tone === 'flag' ? 'bg-red-50 text-flag' : 'bg-blue-50 text-blue-700';
  return (
    <section className={`${surface} p-5 sm:p-6 flex flex-col sm:flex-row gap-4`}>
      <div aria-hidden="true" className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBox}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-prose">{body}</p>
        {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
      </div>
    </section>
  );
}

type ListState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; articles: DoctorArticle[] };

function ArticleList({ lang }: { lang: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<ListState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', articles: await fetchDoctorArticles(lang) });
    } catch {
      setState({ kind: 'error' });
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="my-articles-title" className="space-y-3">
      <h2 id="my-articles-title" className="text-lg font-semibold text-ink">
        {t('articles.my_articles')}
      </h2>

      {state.kind === 'loading' && <div role="status" aria-label={t('common.loading')} className="h-28 bg-slate-200 rounded-xl animate-pulse" />}

      {state.kind === 'error' && (
        <div className={`${surface} p-5 text-center space-y-3`} role="alert">
          <p className="text-sm text-slate-600">{t('articles.list_error')}</p>
          <button type="button" onClick={load} className={btnPrimary}>
            {t('articles.retry')}
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.articles.length === 0 && (
        <div className={`${surface} p-8 text-center`}>
          <Newspaper className="w-10 h-10 text-slate-300 mx-auto" aria-hidden="true" />
          <h3 className="text-base font-medium text-ink mt-3">{t('articles.empty_title')}</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">{t('articles.empty_body')}</p>
        </div>
      )}

      {state.kind === 'ready' && state.articles.length > 0 && (
        <ul className={`${surface} divide-y divide-slate-100 overflow-hidden`}>
          {state.articles.map(article => {
            const title = article.title || t('articles.untitled');
            const date = formatArticleDate(article.createdAt, lang);
            return (
              <li key={article.slug} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink break-words">{title}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <Pill tone={article.published ? 'good' : 'warn'} dot>
                      {article.published ? t('articles.published') : t('articles.in_review')}
                    </Pill>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      {t('articles.views', { n: formatCount(article.views) })}
                    </span>
                    {date && <span>{date}</span>}
                  </p>
                </div>
                <div className="flex gap-2 sm:w-64 sm:shrink-0 sm:justify-end">
                  {article.published && (
                    <a
                      href={portalPath(lang, `/blog/${encodeURIComponent(article.slug)}`)}
                      className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex-1 sm:flex-none`}
                      aria-label={t('articles.open_label', { title })}
                    >
                      <ExternalLink className="w-4 h-4" aria-hidden="true" />
                      {t('articles.open')}
                    </a>
                  )}
                  <a
                    href={portalPath(lang, '/admin?tab=articles')}
                    className={`${btn} text-slate-600 hover:bg-slate-100 flex-1 sm:flex-none`}
                    aria-label={t('articles.edit_label', { title })}
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                    {t('articles.edit')}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
