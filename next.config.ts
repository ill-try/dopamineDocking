import type { NextConfig } from 'next';

const [repositoryOwner, repositoryName] = process.env.GITHUB_REPOSITORY?.split('/') ?? [];
const isUserOrOrganizationPage = repositoryName?.endsWith('.github.io');
const githubPagesPath = repositoryName && !isUserOrOrganizationPage ? `/${repositoryName}` : '';
const githubPagesAssetPrefix =
  process.env.GITHUB_ACTIONS === 'true' && repositoryOwner && repositoryName
    ? `https://${repositoryOwner}.github.io${githubPagesPath}`
    : '';

const nextConfig: NextConfig = {
  output: 'export',
  assetPrefix: githubPagesAssetPrefix,
};

export default nextConfig;
