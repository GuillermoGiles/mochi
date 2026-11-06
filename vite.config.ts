import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// En desarrollo, sirve /api/* con el mismo archivo que usa Vercel en producción.
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Igual que las redirecciones de vercel.json para el conector de Claude.
        if (req.url?.startsWith('/.well-known/oauth-authorization-server')) req.url = '/api/wk-as';
        if (req.url?.startsWith('/.well-known/oauth-protected-resource')) req.url = '/api/wk-pr';
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const mod = await server.ssrLoadModule('/api/[action].ts');
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          // Mismo manejo que Vercel: GET o POST según el pedido.
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const method = req.method === 'POST' ? 'POST' : req.method === 'OPTIONS' ? 'OPTIONS' : 'GET';
          const init: RequestInit = { method, headers };
          if (method === 'POST') init.body = Buffer.concat(chunks);
          const r: Response = await mod[method](new Request(`http://${req.headers.host}${req.url}`, init));
          res.statusCode = r.status;
          r.headers.forEach((v, k) => {
            if (k !== 'set-cookie') res.setHeader(k, v);
          });
          const cookies = r.headers.getSetCookie();
          if (cookies.length) res.setHeader('set-cookie', cookies);
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [
      react(),
      tailwindcss(),
      apiDev(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Mochi',
          short_name: 'Mochi',
          description: 'Tus apuntes de la facultad, ordenados.',
          lang: 'es',
          theme_color: '#fafafa',
          background_color: '#fafafa',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // La app y los visores de PDF, Word, Excel e imágenes quedan guardados para abrir sin internet.
          globPatterns: [
            'index.html',
            'assets/index-*.{js,css}',
            'assets/rolldown-runtime-*.js',
            'assets/{PdfView,SheetView,DocxView,ImageView}-*.js',
            // Las librerías que usan los visores (PDF, Word y Excel), para que también abran sin internet.
            'assets/{pdf,mammoth.browser,xlsx}-*.js',
            'assets/pdf.worker*.{mjs,js}',
            '*.{svg,png,ico}',
          ],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          // Recibe los avisos de parciales y entregas.
          importScripts: ['push-sw.js'],
          navigateFallbackDenylist: [/^\/api\//, /^\/privacidad/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'fonts', expiration: { maxEntries: 20 } },
            },
            {
              urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
              handler: 'CacheFirst',
              options: { cacheName: 'assets', expiration: { maxEntries: 200 } },
            },
          ],
        },
      }),
    ],
  };
});
