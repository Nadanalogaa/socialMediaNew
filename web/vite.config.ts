import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  // Facebook Login refuses to run over plain HTTP, so the dev server is served
  // over HTTPS with a self-signed certificate. Browsers warn once per session.
  plugins: [react(), tailwindcss(), basicSsl()],
  /** The workspace keeps one .env at the repo root, not per package. */
  envDir: '..',
  server: {
    port: 5173,
    /** Binds all interfaces: Vite defaults to IPv6 ::1, which leaves the IPv4
     *  127.0.0.1 that lvh.me and tunnels resolve to unreachable. */
    host: true,
    https: {},
    /**
     * Facebook's App Domains field rejects bare `localhost` because it demands a
     * top-level domain. `lvh.me` is a public DNS name that resolves to
     * 127.0.0.1, so it satisfies Meta while still pointing at this machine.
     * Tunnel hostnames are allowed too, for testing Meta's callbacks.
     */
    allowedHosts: ['localhost', '.lvh.me', '.localtest.me', '.trycloudflare.com', '.ngrok-free.app'],
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
