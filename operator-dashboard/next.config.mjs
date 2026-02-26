import createNextIntlPlugin from 'next-intl/plugin';
import withPWAInit from 'next-pwa';
import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {};

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  sw: 'pwa-sw.js',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\/storage\/v1\/object\/public\/product-images\/.*$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'product-images',
        expiration: {
          maxEntries: 256,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: /\/[^/]+\/machine\/[^/]+$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'consumer-inventory-pages',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 5,
        },
      },
    },
    {
      urlPattern: /\/_next\/static\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static-assets',
        expiration: {
          maxEntries: 128,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        },
      },
    },
    {
      urlPattern: /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'consumer-static-assets',
        expiration: {
          maxEntries: 256,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        },
      },
    },
  ],
});

const withNextIntl = createNextIntlPlugin(path.resolve('./i18n/request.ts'));

export default withNextIntl(withPWA(nextConfig));
