import type { Metadata, Viewport } from 'next'
import './globals.css'

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://mashgiach.tkpapps.com'

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: 'The Kosher Place: Mashgiach',
  description: 'מערכת מעקב ובקרה לביקורי משגיחים',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Mashgiach', statusBarStyle: 'default' },
  openGraph: {
    title: 'The Kosher Place: Mashgiach',
    description: 'מערכת מעקב ובקרה לביקורי משגיחים',
    images: [{ url: '/logo.png', width: 1000, height: 1000, alt: 'The Kosher Place' }],
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#163260',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#163260" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
          }
        `}} />
      </body>
    </html>
  )
}
