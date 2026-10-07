'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { btn, btnPrimary, surface } from '@/components/ui/styles';
import {
  GENERATED_UID_PREFIX,
  PortalSession,
  SignInMethod,
  fetchPortalSession,
  linkPortalAccount,
  linkState,
  portalErrorKey,
  signInMethod,
  unlinkPortalAccount,
} from '@/lib/portalAccount';

const PORTAL_LOGIN_URL = 'https://www.duxtur.org/ru/login';

/**
 * "One person, one account": which sign-in this Edu account uses and which duxtur.org account it is linked to.
 * Linking is always an action of a person who is signed in to BOTH accounts in this browser, confirmed in a dialog.
 */
export default function SignInMethods() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [portal, setPortal] = useState<PortalSession | null>(null);
  const [method, setMethod] = useState<SignInMethod>('unknown');
  const [confirm, setConfirm] = useState<'link' | 'unlink' | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshPortal = useCallback(async () => setPortal(await fetchPortalSession()), []);

  useEffect(() => {
    void refreshPortal();
  }, [refreshPortal]);

  useEffect(() => {
    const current = auth.currentUser;
    if (!current) return;
    let alive = true;
    current
      .getIdTokenResult()
      .then(result => {
        if (alive) setMethod(signInMethod(current.uid, current.providerData.map(p => p.providerId), result.claims.provider));
      })
      .catch(() => {
        if (alive) setMethod(signInMethod(current.uid, current.providerData.map(p => p.providerId)));
      });
    return () => {
      alive = false;
    };
  }, [user?.uid]);

  if (!user) return null;

  const state = portal ? linkState(portal, user.uid) : null;
  const portalName = portal?.signedIn ? portal.name || portal.email : '';
  const generatedOnly = user.uid.startsWith(GENERATED_UID_PREFIX);

  const run = async (action: () => Promise<void>, doneKey: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(t(doneKey));
      await refreshPortal();
    } catch (err) {
      toast.error(t(`account.errors.${portalErrorKey(err)}`));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const link = () =>
    run(async () => {
      const current = auth.currentUser;
      if (!current) throw new Error('not signed in');
      // A fresh token: the link is made from a sign-in that is valid right now.
      await linkPortalAccount(await current.getIdToken(true));
    }, 'account.done_linked');

  const unlink = () => run(() => unlinkPortalAccount(), 'account.done_unlinked');

  return (
    <section className={`${surface} p-5 sm:p-6 mb-6`} aria-labelledby="sign-in-methods-title">
      <h3 id="sign-in-methods-title" className="text-lg font-semibold text-ink">{t('account.title')}</h3>
      <p className="text-sm text-slate-500 mt-1">{t('account.intro')}</p>

      <p className="text-sm text-slate-600 mt-4">
        {t('account.current')}: <span className="font-medium text-ink">{t(`account.methods.${method}`)}</span>
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 p-4">
        <p className="text-sm font-medium text-ink">{t('account.portal_title')}</p>

        {state === null && <p className="text-sm text-slate-500 mt-1" role="status">{t('account.checking')}</p>}

        {state === 'not_signed_in' && (
          <>
            <p className="text-sm text-slate-600 mt-1">{t('account.not_signed_in')}</p>
            <a href={PORTAL_LOGIN_URL} className={`${btn} mt-3 inline-flex`}>{t('account.sign_in_portal')}</a>
          </>
        )}

        {state === 'linkable' && (
          <>
            <p className="text-sm text-slate-600 mt-1">{t('account.linkable', { name: portalName })}</p>
            <button type="button" onClick={() => setConfirm('link')} disabled={busy} className={`${btnPrimary} mt-3`}>
              {busy ? t('account.linking') : t('account.link')}
            </button>
          </>
        )}

        {state === 'linked_here' && (
          <>
            <p className="text-sm text-slate-600 mt-1">{t('account.linked', { name: portalName })}</p>
            {generatedOnly ? (
              <p className="text-xs text-slate-500 mt-2">{t('account.cannot_unlink')}</p>
            ) : (
              <button type="button" onClick={() => setConfirm('unlink')} disabled={busy} className={`${btn} mt-3`}>
                {busy ? t('account.unlinking') : t('account.unlink')}
              </button>
            )}
          </>
        )}

        {state === 'linked_elsewhere' && (
          <p className="text-sm text-slate-600 mt-1">{t('account.linked_elsewhere', { name: portalName })}</p>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirm === 'link'}
        title={t('account.link_confirm_title')}
        message={t('account.link_confirm_body', {
          method: t(`account.methods.${method}`),
          name: portal?.signedIn ? portal.name || '—' : '',
          email: portal?.signedIn ? portal.email || '—' : '',
        })}
        confirmText={t('account.link_confirm')}
        cancelText={t('common.cancel')}
        confirmDisabled={busy}
        onConfirm={link}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm === 'unlink'}
        title={t('account.unlink_confirm_title')}
        message={t('account.unlink_confirm_body')}
        confirmText={t('account.unlink')}
        cancelText={t('common.cancel')}
        confirmDisabled={busy}
        isDestructive
        onConfirm={unlink}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
