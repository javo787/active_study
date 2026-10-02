/** @type {import('next').NextConfig} */
// Set NEXT_PUBLIC_BASE_PATH=/edu for the build that is mounted at duxtur.org/edu.
// Leave it unset for a standalone build (the current deployment keeps working as is).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig = {
  output: 'export',
  basePath,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
