// Merge into next.config.js
// Images are already compressed to WebP in the browser before upload, so we
// turn off Next's built-in optimizer. That means no Vercel image processing
// (and no Vercel image-optimization quota/billing) for any <Image>.
const nextConfig = {
  images: {
    unoptimized: true,
  },
};

export default nextConfig; // or module.exports = nextConfig;