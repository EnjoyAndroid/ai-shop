/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用 standalone 模式（Docker 部署必需）
  output: 'standalone',

  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 客户端构建时不打包这些服务端模块
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        dns: false,
        fs: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
