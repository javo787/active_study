import { BASE_PATH } from '@/lib/appUrl';
import { buildManifest } from '@/lib/pwa';

// Written at build time (the app is a static export), for the base path the build is made for.
//
// This is a route and not the app/manifest.ts convention on purpose: with a base path, Next writes the convention's
// <link rel="manifest"> as "/manifest.webmanifest" WITHOUT the base path, so under duxtur.org the page would load the
// portal's own manifest instead of this one. Here the layout names the address itself (see manifestPath in lib/pwa.ts).
export const dynamic = 'force-static';

export function GET() {
  return new Response(JSON.stringify(buildManifest(BASE_PATH)), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
