/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['resium', 'cesium'],
  env: {
    CESIUM_BASE_URL: '/cesium',
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        Buffer: false,
        http: false,
        https: false,
        zlib: false,
      };
    }

    // Exclude Cesium workers from being processed
    config.module.rules.push({
      test: /\.js$/,
      include: /cesium[\\/]Build/,
      type: 'asset/resource',
    });

    return config;
  },
};

export default nextConfig;
