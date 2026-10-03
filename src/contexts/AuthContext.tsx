'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithCustomToken, GoogleAuthProvider, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, deleteField, arrayUnion, arrayRemove } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Group, TeacherStatus, UserRole } from '@/types';
import { toast } from 'react-hot-toast';
import { startTelegramLogin, waitForTelegramLogin, TelegramLoginSession } from '@/lib/telegramAuth';
import { describeError, tgLog } from '@/lib/tgLog';
import { JoinGroupError, isValidJoinCode, normalizeJoinCode } from '@/lib/groups';

interface AppUser {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  fullName?: string;
  group?: string;
  university?: string;
  course?: number;
  department?: string;
  teacherStatus?: TeacherStatus;
  groupIds?: string[];
}

export interface ProfileData {
  fullName: string;
  group?: string;
  university?: string;
  course?: number;
  department?: string;
  /** Ask the admin for teacher access (sets teacherStatus: 'pending'). */
  requestTeacher?: boolean;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  startTelegramSignIn: () => Promise<TelegramLoginSession>;
  finishTelegramSignIn: (session: TelegramLoginSession, signal?: AbortSignal) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: ProfileData) => Promise<void>;
  joinGroup: (code: string) => Promise<Group>;
  leaveGroup: (code: string) => Promise<void>;
  pruneGroups: (ids: string[]) => Promise<void>;
  /** Re-read users/{uid}, e.g. to notice that an admin approved a teacher request. */
  refreshUser: () => Promise<void>;
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
  pruneGroups: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const isTelegramUser = firebaseUser.uid.startsWith('tg_');
          if (isTelegramUser) {
            tgLog('info', 'auth:state-signed-in', { uidPrefix: firebaseUser.uid.slice(0, 6), providers: firebaseUser.providerData.map(p => p.providerId) });
          }
          // Fetch user role from Firestore
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (isTelegramUser) tgLog('info', 'auth:profile-doc-read', { exists: userDoc.exists() });

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
            if (isTelegramUser) tgLog('info', 'auth:profile-doc-created', { role: appUser.role, hasDisplayName: appUser.displayName !== 'Anonymous' });
            setUser(appUser);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth state change error', error);
        if (firebaseUser?.uid.startsWith('tg_')) {
          tgLog('error', 'auth:profile-load-failed', {
            ...describeError(error),
            meaning: 'signed in to Firebase, but reading or creating users/{uid} failed: check Firestore rules (permission-denied) or the network',
          });
        }
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
    tgLog('info', 'firebase:signInWithCustomToken-begin');
    try {
      const cred = await signInWithCustomToken(auth, customToken);
      tgLog('info', 'firebase:signInWithCustomToken-ok', { uidPrefix: cred.user.uid.slice(0, 6), isNewUser: cred.user.metadata.creationTime === cred.user.metadata.lastSignInTime });
    } catch (error) {
      const code = (error as { code?: string }).code;
      tgLog('error', 'firebase:signInWithCustomToken-failed', {
        ...describeError(error),
        meaning:
          code === 'auth/custom-token-mismatch'
            ? 'the token was signed for a different Firebase project than the one this app uses'
            : code === 'auth/invalid-custom-token'
              ? 'the token is malformed or signed with the wrong key'
              : code === 'auth/network-request-failed'
                ? 'no connection to Google (identitytoolkit.googleapis.com), or CSP connect-src blocks it'
                : undefined,
      });
      throw error;
    }
  };

  const updateProfile = async (data: ProfileData) => {
    if (!user) return;
    try {
      const { requestTeacher, ...fields } = data;
      // Firestore rejects `undefined` values, so only send what was actually filled in.
      const update: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) update[key] = value;
      }
      if (requestTeacher && !user.teacherStatus) update.teacherStatus = 'pending';

      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, update);
      setUser((prev) => prev ? { ...prev, ...update } as AppUser : null);
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

  const pruneGroups = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    await updateDoc(doc(db, 'users', user.uid), { groupIds: arrayRemove(...ids) });
    setUser((prev) => prev ? { ...prev, groupIds: (prev.groupIds ?? []).filter(g => !ids.includes(g)) } : null);
  };

  const refreshUser = async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) setUser(snap.data() as AppUser);
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, startTelegramSignIn, finishTelegramSignIn, signOut, updateProfile, joinGroup, leaveGroup, pruneGroups, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
