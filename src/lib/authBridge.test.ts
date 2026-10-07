import { describe, it, expect } from 'vitest';
import { BRIDGE_MESSAGE, buildBridgeMessage } from './authBridge';

const user = (over: Partial<{ photoURL: string | null; displayName: string | null; token: () => Promise<string> }> = {}) => ({
  photoURL: over.photoURL ?? null,
  displayName: over.displayName ?? null,
  getIdToken: over.token ?? (async () => 'id-token'),
});

describe('buildBridgeMessage', () => {
  it('says "not signed in" when there is no user', async () => {
    expect(await buildBridgeMessage(null)).toEqual({ type: BRIDGE_MESSAGE, signedIn: false });
  });

  it('hands over the ID token with the profile name', async () => {
    const msg = await buildBridgeMessage(user({ displayName: 'Google Name', photoURL: 'https://lh3.googleusercontent.com/a' }), 'Dr Karimov');
    expect(msg).toEqual({ type: BRIDGE_MESSAGE, signedIn: true, idToken: 'id-token', name: 'Dr Karimov', image: 'https://lh3.googleusercontent.com/a' });
  });

  it('falls back to the Firebase name, then to an empty name', async () => {
    expect(await buildBridgeMessage(user({ displayName: 'Google Name' }))).toMatchObject({ name: 'Google Name' });
    expect(await buildBridgeMessage(user())).toMatchObject({ name: '' });
  });

  it('never passes on a picture that is not https', async () => {
    expect(await buildBridgeMessage(user({ photoURL: 'http://insecure/x.png' }))).toMatchObject({ image: '' });
  });

  it('answers "not signed in" when the token cannot be obtained', async () => {
    const msg = await buildBridgeMessage(user({ token: async () => { throw new Error('auth/network-request-failed'); } }));
    expect(msg).toEqual({ type: BRIDGE_MESSAGE, signedIn: false });
  });
});
