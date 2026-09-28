with open("src/contexts/AuthContext.tsx", "r") as f:
    content = f.read()

import re

old_auth_logic = """          if (userDoc.exists()) {
            appUser = { ...userDoc.data() } as AppUser;
            await updateDoc(userDocRef, { expiresAt });
          } else {
            // Create new user document with default 'student' role
            appUser = {
              uid: firebaseUser.uid,
              role: 'student',
              displayName: firebaseUser.displayName || 'Anonymous',
              email: firebaseUser.email || '',
            };
            await setDoc(userDocRef, {
              ...appUser,
              createdAt: serverTimestamp(),
              expiresAt,
            });
          }

          setUser(appUser);"""

new_auth_logic = """          if (userDoc.exists()) {
            appUser = { ...userDoc.data() } as AppUser;
            setUser(appUser);

            const data = userDoc.data();
            const currentExpiresMs = data.expiresAt ? data.expiresAt.toMillis() : 0;
            const targetExpiresMs = expiresAt.toMillis();

            if (targetExpiresMs - currentExpiresMs > 24 * 60 * 60 * 1000) {
              updateDoc(userDocRef, { expiresAt }).catch(console.warn);
            }
          } else {
            // Create new user document with default 'student' role
            appUser = {
              uid: firebaseUser.uid,
              role: 'student',
              displayName: firebaseUser.displayName || 'Anonymous',
              email: firebaseUser.email || '',
            };
            await setDoc(userDocRef, {
              ...appUser,
              createdAt: serverTimestamp(),
              expiresAt,
            });
            setUser(appUser);
          }"""

content = content.replace(old_auth_logic, new_auth_logic)

with open("src/contexts/AuthContext.tsx", "w") as f:
    f.write(content)
