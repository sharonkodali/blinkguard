import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Empty turbopack config to silence warnings
  turbopack: {},

  // Suppress MediaPipe "Critical dependency" warnings in webpack
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;