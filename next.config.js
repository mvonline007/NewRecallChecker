/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // allow remote images if you later switch to next/image
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'rappel.conso.gouv.fr' },
      { protocol: 'https', hostname: 'static.etalab.gouv.fr' }
    ]
  }
};

export default nextConfig;
