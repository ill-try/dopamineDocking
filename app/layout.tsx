import type { Metadata } from 'next';
import './globals.css';

const [repositoryOwner, repositoryName] = process.env.GITHUB_REPOSITORY?.split('/') ?? [];
const isUserOrOrganizationPage = repositoryName?.endsWith('.github.io');
const githubPagesPath = repositoryName && !isUserOrOrganizationPage ? `/${repositoryName}` : '';
const siteUrl =
  process.env.GITHUB_ACTIONS === 'true' && repositoryOwner && repositoryName
    ? `https://${repositoryOwner}.github.io${githubPagesPath}`
    : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Dopamine Docking Lab',
  description:
    'Explore how dopamine functional groups affect fit and noncovalent interactions in a simplified D2 receptor pocket.',
  openGraph: {
    title: 'Dopamine Docking Lab',
    description: 'Explore a transparent educational model of dopamine contacts in a simplified D2 receptor pocket.',
    images: [{ url: `${siteUrl}/dopamine-d2-contact-map.svg`, width: 1200, height: 630, alt: 'Dopamine and D2 receptor contact map' }],
  },
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
