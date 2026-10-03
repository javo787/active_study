This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Deploying under duxtur.org/edu

The app is a static export (`output: 'export'`) mounted at `https://duxtur.org/edu` by the
duxtur-portal project, which proxies `/edu/**` to the origin that serves this build at its root.

1. Build for the mount point (the prefix is baked in at build time):
   ```bash
   NEXT_PUBLIC_BASE_PATH=/edu npm run build   # -> ./out
   ```
   A build without `NEXT_PUBLIC_BASE_PATH` is a normal standalone build (previous behaviour).
2. Publish `./out` to a **separate** Firebase Hosting site, so the current deployment is not touched:
   ```bash
   firebase hosting:sites:create <site-id>
   firebase target:apply hosting edu <site-id>      # maps the "edu" target in firebase.json
   firebase deploy --only hosting:edu
   ```
3. In the portal's Vercel project set `EDU_APP_ORIGIN=https://<site-id>.web.app` and redeploy.
4. Firebase Console -> Authentication -> Settings -> Authorized domains: add `duxtur.org`.
5. Firestore rules live in `firestore.rules`: `firebase deploy --only firestore:rules`.

Links shared with students are built with `appUrl()` (`src/lib/appUrl.ts`), which adds the prefix.

## Tests and CI

```bash
npm run typecheck   # tsc --noEmit
npm test            # unit tests of pure logic (vitest)
npm run test:rules  # Firestore security rules, against the local emulator
```

`npm run test:rules` starts the Firestore emulator through `firebase emulators:exec` (it needs Java 21 and downloads
the emulator on first use) and runs `tests/rules/*.test.ts` against `firestore.rules`. Every rules change comes with a
test there. GitHub Actions (`.github/workflows/ci.yml`) runs all of the above plus lint and the static export build on
every pull request.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
