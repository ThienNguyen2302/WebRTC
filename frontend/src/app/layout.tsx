import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WebRTC Learning MVP',
  description: 'Temporary peer-to-peer call learning demo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
