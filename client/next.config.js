const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: '/offline'
  },
  runtimeCaching: [
    {
      // Keep login and dashboard screens available while offline.
      urlPattern:
        /^https?:\/\/[^/]+\/(?:$|login$|admin\/dashboard$|teacher\/dashboard$|student\/dashboard$|parent\/dashboard$)/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'essential-pages-cache',
        networkTimeoutSeconds: 6,
        expiration: {
          maxEntries: 40,
          maxAgeSeconds: 7 * 24 * 60 * 60
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      urlPattern: /^https?:\/\/[^/]+\/_next\/static\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-static-assets',
        expiration: {
          maxEntries: 128,
          maxAgeSeconds: 30 * 24 * 60 * 60
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      urlPattern: /^https?:\/\/[^/]+\/.*\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|css|js)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-file-assets',
        expiration: {
          maxEntries: 160,
          maxAgeSeconds: 30 * 24 * 60 * 60
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      // Do not cache API responses in SW because auth + permissions are dynamic.
      urlPattern: /^https?:\/\/[^/]+\/api\/.*/i,
      handler: 'NetworkOnly',
      method: 'GET'
    }
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname
  }
};

module.exports = withPWA(nextConfig);