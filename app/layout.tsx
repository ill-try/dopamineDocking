import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dopamine Docking Lab',
  description:
    'Explore how dopamine functional groups affect fit and noncovalent interactions in a simplified D2 receptor pocket.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
