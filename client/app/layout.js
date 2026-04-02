import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'School Management System',
  description: 'Full Stack School Management System'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}