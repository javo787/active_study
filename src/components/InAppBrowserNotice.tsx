'use client';

import { useEffect, useState } from 'react';

export default function InAppBrowserNotice() {
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isIOSInApp = /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua);
    const isAndroidInApp = /wv\)/i.test(ua);
    const isOtherInApp = /FBAN|FBAV|Instagram|Snapchat|MicroMessenger|Line\/|Telegram/i.test(ua);

    if (isIOSInApp || isAndroidInApp || isOtherInApp) {
      setIsInAppBrowser(true);
    }
  }, []);

  const handleCopyLink = () => {
    const url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copied to clipboard!');
      }).catch(err => {
        console.error('Could not copy text: ', err);
        fallbackCopyTextToClipboard(url);
      });
    } else {
      fallbackCopyTextToClipboard(url);
    }
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    window.prompt('Copy this link and open it in Safari or Chrome:', text);
  };

  if (!isInAppBrowser) {
    return null;
  }

  return (
    <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-md w-full max-w-sm mx-auto">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-amber-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-amber-800">In-App Browser Detected</h3>
          <div className="mt-2 text-sm text-amber-700">
            <p>
              Google sign-in doesn&apos;t work inside in-app browsers (Telegram, Instagram...). Open this page in Chrome or Safari (menu -&gt; Open in browser).
            </p>
          </div>
          <div className="mt-4">
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-amber-700 bg-amber-100 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 min-h-[44px]"
            >
              Copy link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
