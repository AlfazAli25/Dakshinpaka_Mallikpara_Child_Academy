import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'School Management System',
  description: 'Full Stack School Management System'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {/* Top accent line */}
        <div className="fixed top-0 left-0 w-full h-[3px] z-50 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500" style={{boxShadow: '0 1px 8px 0 rgba(0,0,0,0.08)'}} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}