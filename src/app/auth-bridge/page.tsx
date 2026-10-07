'use client';

import { useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { buildBridgeMessage } from '@/lib/authBridge';

// Not a page for people. duxtur.org loads this one in a hidden frame (same origin) to learn whether somebody is signed
// in to Duxtur Edu in this browser, so that "Continue as ..." and "Write an article" need no second sign-in.
//
// The answer goes ONLY to the page that framed us and only when that page is on our own origin: a postMessage with an
// explicit target origin is simply dropped by the browser when a foreign site has framed this page. Opened on its own
// (not in a frame) the page does nothing.

export default function AuthBridge() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || window.parent === window) return;
    let alive = true;
    buildBridgeMessage(auth.currentUser, user?.fullName || user?.displayName).then(message => {
      if (alive) window.parent.postMessage(message, window.location.origin);
    });
    return () => {
      alive = false;
    };
  }, [loading, user]);

  return null;
}
