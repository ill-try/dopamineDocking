import type { NextConfig } from 'next';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isUserOrOrganizationPage = repositoryName?.endsWith('.github.io');
const githubPagesBasePath =
  process.env.GITHUB_ACTIONS === 'true' && repositoryName && !isUserOrOrganizationPage
    ? `/${repositoryName}`
    : '';

const nextConfig: NextConfig = {
  output: 'export',
  assetPrefix: githubPagesBasePath,
};

export default nextConfig;
