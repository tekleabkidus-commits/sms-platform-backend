/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
