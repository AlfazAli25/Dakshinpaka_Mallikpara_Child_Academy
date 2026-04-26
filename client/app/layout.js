import './globals.css';
import Providers from './providers';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(appUrl),
  applicationName: 'School Management System',
  title: 'School Management System',
  description: 'Full Stack School Management System',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SchoolApp'
  },
  formatDetection: {
    telephone: false
  },
  other: {
    'mobile-web-app-capable': 'yes'
  }
};

export const viewport = {
  themeColor: '#1976d2'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {/* Top accent line handled by TopProgressBar */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}