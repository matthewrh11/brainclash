import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: {
    default: 'BrainClash — 1v1 Trivia with Ranked Matchmaking',
    template: '%s | BrainClash',
  },
  description: 'Challenge friends or get matched in real-time 1v1 trivia battles. Answer fast, climb the Elo ranks, and compete in daily challenges. Free to play.',
  keywords: ['trivia game', 'online trivia', '1v1 trivia', 'trivia battle', 'quiz game', 'multiplayer trivia', 'ranked trivia', 'daily trivia', 'trivia challenge', 'brain game', 'knowledge game'],
  metadataBase: new URL('https://brainclash.vercel.app'),
  openGraph: {
    type: 'website',
    siteName: 'BrainClash',
    title: 'BrainClash — 1v1 Trivia with Ranked Matchmaking',
    description: 'Challenge friends or get matched in real-time 1v1 trivia battles. Answer fast, climb the Elo ranks, and compete in daily challenges.',
    url: 'https://brainclash.vercel.app',
  },
  twitter: {
    card: 'summary',
    title: 'BrainClash — 1v1 Trivia with Ranked Matchmaking',
    description: 'Challenge friends or get matched in real-time 1v1 trivia battles. Answer fast, climb the ranks.',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧠</text></svg>",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BrainClash',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased bg-gray-950 text-white`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
