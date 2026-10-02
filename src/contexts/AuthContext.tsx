'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithCustomToken, GoogleAuthProvider, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, deleteField, arrayUnion, arrayRemove } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Group, UserRole } from '@/types';
import { toast } from 'react-hot-toast';
import { startTelegramLogin, waitForTelegramLogin, TelegramLoginSession } from '@/lib/telegramAuth';
import { JoinGroupError, isValidJoinCode, normalizeJoinCode } from '@/lib/groups';

interface AppUser {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  fullName?: string;
  group?: string;
  groupIds?: string[];
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  startTelegramSignIn: () => Promise<TelegramLoginSession>;
  finishTelegramSignIn: (session: TelegramLoginSession, signal?: AbortSignal) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: { fullName: string; group?: string }) => Promise<void>;
  joinGroup: (code: string) => Promise<Group>;
  leaveGroup: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  startTelegramSignIn: async () => { throw new Error('AuthProvider missing'); },
  finishTelegramSignIn: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
  joinGroup: async () => { throw new Error('AuthProvider missing'); },
  leaveGroup: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Fetch user role from Firestore
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          let appUser: AppUser;
          const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

          if (userDoc.exists()) {
            appUser = { ...userDoc.data() } as AppUser;
            setUser(appUser);

            const data = userDoc.data();
            if (appUser.role === 'student') {
              const currentExpiresMs = data.expiresAt ? data.expiresAt.toMillis() : 0;
              const targetExpiresMs = expiresAt.toMillis();

              if (targetExpiresMs - currentExpiresMs > 24 * 60 * 60 * 1000) {
                updateDoc(userDocRef, { expiresAt }).catch(console.warn);
              }
            } else if (data.expiresAt) {
              updateDoc(userDocRef, { expiresAt: deleteField() }).catch(console.warn);
            }
          } else {
            // Create new user document with default 'student' role
            let displayName = firebaseUser.displayName || '';
            if (!displayName) {
              // Telegram sign-in has no Google profile; the portal puts the name in a token claim.
              try {
                const tokenResult = await firebaseUser.getIdTokenResult();
                if (typeof tokenResult.claims.tgName === 'string') displayName = tokenResult.claims.tgName;
              } catch {}
            }
            appUser = {
              uid: firebaseUser.uid,
              role: 'student',
              displayName: displayName || 'Anonymous',
              email: firebaseUser.email || '',
            };
            await setDoc(userDocRef, {
              ...appUser,
              createdAt: serverTimestamp(),
              expiresAt,
            });
            setUser(appUser);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth state change error', error);
        toast.error('Could not load your profile. Check your connection.');
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      console.error('Error signing in with Google', error);
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'auth/popup-blocked') {
        toast.error('Popup blocked. Please allow popups for this site to sign in.');
      } else if (errorCode === 'auth/network-request-failed') {
        toast.error('Network error. Check your connection.');
      } else if (errorCode === 'auth/unauthorized-domain') {
        toast.error('This domain is not authorized for Google Sign-In.');
      } else if (errorCode !== 'auth/popup-closed-by-user' && errorCode !== 'auth/cancelled-popup-request') {
        toast.error('An error occurred during sign in.');
      }
    }
  };

  const startTelegramSignIn = async () => startTelegramLogin();

  const finishTelegramSignIn = async (session: TelegramLoginSession, signal?: AbortSignal) => {
    const customToken = await waitForTelegramLogin(session, signal);
    await signInWithCustomToken(auth, customToken);
  };

  const updateProfile = async (data: { fullName: string; group?: string }) => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { ...data });
      setUser((prev) => prev ? { ...prev, ...data } : null);
    } catch (error) {
      console.error('Error updating profile', error);
      throw error;
    }
  };

  const joinGroup = async (rawCode: string): Promise<Group> => {
    if (!user) throw new JoinGroupError('failed', 'Not signed in');
    const code = normalizeJoinCode(rawCode);
    if (!isValidJoinCode(code)) throw new JoinGroupError('invalid', 'That code does not look right');

    const snap = await getDoc(doc(db, 'groups', code));
    if (!snap.exists()) throw new JoinGroupError('not_found', 'No group with this code');

    if (!(user.groupIds ?? []).includes(code)) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { groupIds: arrayUnion(code) });
      } catch (error) {
        console.error('Error joining group', error);
        throw new JoinGroupError('failed', 'Could not join the group');
      }
      setUser((prev) => prev ? { ...prev, groupIds: [...(prev.groupIds ?? []), code] } : null);
    }
    return { id: snap.id, ...snap.data() } as Group;
  };

  const leaveGroup = async (code: string) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), { groupIds: arrayRemove(code) });
    setUser((prev) => prev ? { ...prev, groupIds: (prev.groupIds ?? []).filter(g => g !== code) } : null);
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, startTelegramSignIn, finishTelegramSignIn, signOut, updateProfile, joinGroup, leaveGroup }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
