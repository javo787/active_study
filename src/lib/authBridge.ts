// Duxtur Edu answers one question for the portal: "who is signed in here?". duxtur.org (same origin) opens
// /edu/auth-bridge in a hidden frame; this module builds the answer that page posts back.
// The portal never trusts the name: it verifies the ID token on its server before it signs anybody in.

export const BRIDGE_MESSAGE = 'duxtur:edu-bridge';

export type BridgeMessage =
  | { type: typeof BRIDGE_MESSAGE; signedIn: false }
  | { type: typeof BRIDGE_MESSAGE; signedIn: true; idToken: string; name: string; image: string };

/** The part of a Firebase user the answer needs (kept narrow so tests need no Firebase). */
export interface BridgeFirebaseUser {
  photoURL: string | null;
  displayName: string | null;
  getIdToken(): Promise<string>;
}

/**
 * @param profileName the name the person has in Edu (their profile), preferred for display
 */
export async function buildBridgeMessage(user: BridgeFirebaseUser | null, profileName?: string): Promise<BridgeMessage> {
  if (!user) return { type: BRIDGE_MESSAGE, signedIn: false };
  try {
    // A token that is still good for a few minutes comes back as is; an old one is refreshed first.
    const idToken = await user.getIdToken();
    return {
      type: BRIDGE_MESSAGE,
      signedIn: true,
      idToken,
      name: (profileName || user.displayName || '').trim(),
      image: user.photoURL && user.photoURL.startsWith('https://') ? user.photoURL : '',
    };
  } catch {
    // Offline, or the refresh token was revoked: to the portal that is the same as not being signed in.
    return { type: BRIDGE_MESSAGE, signedIn: false };
  }
}
