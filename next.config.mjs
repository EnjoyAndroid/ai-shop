/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用 standalone 模式（Docker 部署必需）
  output: 'standalone',
  distDir: process.env.NEXT_DEV_ISOLATED === '1' ? '.next-dev' : '.next',

  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },

  // 安全响应头
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',  // 防止点击劫持
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',  // 防止 MIME 类型嗅探
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',  // 控制 Referer 信息
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',  // XSS 过滤（旧浏览器）
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',  // 禁用敏感权限
          },
        ],
      },
    ];
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
