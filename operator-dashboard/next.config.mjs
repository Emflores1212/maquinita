import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {};

const withNextIntl = createNextIntlPlugin(path.resolve('./i18n/request.ts'));

export default withNextIntl(nextConfig);
