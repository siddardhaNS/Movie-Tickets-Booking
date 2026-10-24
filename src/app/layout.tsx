import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: { default: 'Tickets', template: '%s · Tickets' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Anton&family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
