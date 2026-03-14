/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@f1-hub/contracts", "@f1-hub/data", "@f1-hub/ui"],
};

export default nextConfig;
