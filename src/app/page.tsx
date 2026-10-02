'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { loadTelegramSession, clearTelegramSession, describeStartError, TelegramLoginError, TelegramLoginSession } from '@/lib/telegramAuth';
import { describeError, tgLog, tgWatchCsp } from '@/lib/tgLog';
import TelegramDiagnostics from '@/components/TelegramDiagnostics';
import InAppBrowserNotice from '@/components/InAppBrowserNotice';

export default function LoginPage() {
  const { user, loading, signInWithGoogle, startTelegramSignIn, finishTelegramSignIn } = useAuth();
  const router = useRouter();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [tgSession, setTgSession] = useState<TelegramLoginSession | null>(null);
  const [tgStarting, setTgStarting] = useState(false);
  const tgAbortRef = useRef<AbortController | null>(null);

  const waitForTelegram = async (session: TelegramLoginSession) => {
    tgAbortRef.current?.abort();
    const controller = new AbortController();
    tgAbortRef.current = controller;
    setTgSession(session);
    try {
      await finishTelegramSignIn(session, controller.signal);
      tgLog('info', 'flow:finished-signed-in');
    } catch (err) {
      if (err instanceof TelegramLoginError && err.code === 'cancelled') return;
      tgLog('error', 'flow:failed', describeError(err));
      if (err instanceof TelegramLoginError && err.code === 'expired') {
        toast.error('The Telegram link expired. Please try again.');
      } else {
        toast.error('Telegram sign-in failed. Open Diagnostics below for details.');
      }
      setTgSession(null);
    }
  };

  const handleTelegramLogin = async () => {
    tgLog('info', 'ui:continue-with-telegram-clicked');
    setTgStarting(true);
    try {
      const session = await startTelegramSignIn();
      // Opening from here may be blocked by the browser; the visible "Open Telegram" button is the fallback.
      // 'noopener' makes window.open return null even on success, so the result says nothing about blocking.
      window.open(session.botUrl, '_blank', 'noopener');
      tgLog('info', 'ui:window.open-called', { note: 'result is always null with noopener; if Telegram did not open, use the "Open Telegram" button' });
      void waitForTelegram(session);
    } catch (err) {
      tgLog('error', 'flow:start-failed', describeError(err));
      toast.error(describeStartError(err));
    } finally {
      setTgStarting(false);
    }
  };

  const cancelTelegramLogin = () => {
    tgLog('info', 'ui:cancel-clicked');
    tgAbortRef.current?.abort();
    clearTelegramSession();
    setTgSession(null);
  };

  // The browser may reload the page while the user is in Telegram: pick the login back up.
  useEffect(() => {
    tgWatchCsp();
    const pending = loadTelegramSession();
    if (pending) void waitForTelegram(pending);
    return () => tgAbortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    if (!loading && user) {
      router.replace(`/dashboard/${user.role}`);
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If user is logged in, we are redirecting, so we can return null to avoid flashing login UI
  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
        <div className="p-8 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 text-blue-600 mb-2">
            <LogIn className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Active Study
            </h1>
            <p className="text-slate-500">
              Sign in to access your dashboard
            </p>
          </div>

          <InAppBrowserNotice />

          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full min-h-[48px] flex items-center justify-center gap-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 focus:ring-4 focus:ring-slate-100 font-medium rounded-lg text-base px-5 py-3.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingIn ? (
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
            ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            )}
            {isLoggingIn ? 'Signing in...' : 'Continue with Google'}
          </button>

          {tgSession ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-left space-y-3">
              <p className="text-sm text-slate-700">
                1. Open Telegram and press <b>Start</b>.<br />
                2. Tap <b>Confirm</b> in the bot.<br />
                3. Come back here — you will be signed in automatically.
              </p>
              <a
                href={tgSession.botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg text-base px-5 py-3 transition-colors"
              >
                <Send className="w-5 h-5" />
                Open Telegram
              </a>
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin"></span>
                  Waiting for confirmation…
                </span>
                <button onClick={cancelTelegramLogin} className="underline hover:text-slate-700">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleTelegramLogin}
              disabled={tgStarting}
              className="w-full min-h-[48px] flex items-center justify-center gap-3 bg-sky-500 hover:bg-sky-600 focus:ring-4 focus:ring-sky-100 text-white font-medium rounded-lg text-base px-5 py-3.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
              {tgStarting ? 'Starting…' : 'Continue with Telegram'}
            </button>
          )}
          <TelegramDiagnostics />
        </div>

        <div className="bg-slate-50 py-4 px-8 border-t border-slate-100 text-center">
          <p className="text-sm text-slate-500">
            Secure, reliable online examination platform.
          </p>
        </div>
      </div>
    </div>
  );
}
