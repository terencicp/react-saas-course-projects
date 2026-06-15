import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  typedRoutes: true,
  reactCompiler: true,
  turbopack: { root: __dirname },
  devIndicators: false,
};

export default nextConfig;
