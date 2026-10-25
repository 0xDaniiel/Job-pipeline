/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // On Vercel each API route is bundled on its own. These lines make sure the
  // CV PDFs and the Apply kit file are shipped with the routes that read them.
  experimental: {
    outputFileTracingIncludes: {
      "/api/resume": ["./resumes/**/*"],
      "/api/approve": ["./resumes/**/*"],
      "/api/kit": ["./config/applyKit.json"],
    },
  },
};

module.exports = nextConfig;
