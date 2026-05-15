import type { NextConfig } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        // Proxy les liens campagne vers le backend API
        // Permet d'utiliser l'URL admin dans les pubs même si APP_URL est mal configuré
        source: '/campaign/t/:code',
        destination: `${API_URL}/campaign/t/:code`,
      },
    ];
  },
};

export default nextConfig;
