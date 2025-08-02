/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enable experimental features as needed
  },
  // API routes configuration
  async headers() {
    return [
      {
        // Apply CORS headers to all API routes
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, x-user-email',
          },
        ],
      },
    ];
  },
  // Environment variables
  env: {
    API_VERSION: 'v1',
  },
  // Logging
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },
};

module.exports = nextConfig;