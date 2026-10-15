import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import AppToaster from "@/components/AppToaster";
import I18nProvider from "@/components/I18nProvider";
import PwaRegister from "@/components/PwaRegister";
import { EARLY_CAPTURE_SCRIPT } from "@/lib/installPrompt";
import { BASE_PATH } from "@/lib/appUrl";
import { appleIconPath, manifestPath } from "@/lib/pwa";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Duxtur Edu",
  description: "Online Examination Platform",
  manifest: manifestPath(BASE_PATH),
  // iPhone and iPad take the home-screen icon and the "app" look from the page, not from the manifest.
  appleWebApp: { capable: true, title: "Duxtur Edu", statusBarStyle: "default" },
  icons: { apple: [{ url: appleIconPath(BASE_PATH), sizes: "180x180" }] },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a'
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: EARLY_CAPTURE_SCRIPT }} />
        <PwaRegister />
        <I18nProvider>
          <AuthProvider>
              <AppToaster />
              {children}
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
