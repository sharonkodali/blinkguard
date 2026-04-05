/** @type {import('next').NextConfig} */
const nextConfig = {
  // Empty turbopack config to silence warnings
  turbopack: {},

  // Suppress MediaPipe "Critical dependency" warnings in webpack
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (!isServer) {
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