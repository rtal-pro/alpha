/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@repo/shared', '@repo/db', '@repo/llm', '@repo/scoring'],
};

module.exports = nextConfig;
