import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files and pg has optional native bindings; keep both out of the bundle.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
};

export default nextConfig;
