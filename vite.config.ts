import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

// GitHub Pages has no SPA rewrite, so deep links / refreshes on client routes
// (e.g. /kanjii/kanji) would 404. Serving a 404.html that's a copy of index.html
// lets the app boot and React Router resolve the route. Runs after the bundle is
// written so it picks up the current hashed asset names.
const spaFallback = () => ({
  name: "spa-404-fallback",
  // writeBundle runs after index.html is on disk; order/sequential keep it from
  // racing the other plugins' close hooks.
  writeBundle: {
    order: "post" as const,
    sequential: true,
    handler() {
      copyFileSync(
        resolve(__dirname, "docs/index.html"),
        resolve(__dirname, "docs/404.html"),
      );
    },
  },
});

export default defineConfig({
  base: "/kanjii/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      workbox: {
        // 6,700+ KanjiVG stroke files (~44 MB) are too many to precache, so they
        // are fetched on demand. Cache each one the first time it's requested so
        // writing/stroke practice for any kanji you've opened works offline too.
        runtimeCaching: [
          {
            urlPattern: /\/kanjiVG\/.*\.svg$/,
            handler: "CacheFirst",
            options: {
              cacheName: "kanjivg-strokes",
              expiration: {
                maxEntries: 7000,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "Kanjii",
        short_name: "Kanjii",
        description: "Learn kanji efficiently!",
        theme_color: "#242424",
        background_color: "#242424",
        display: "standalone",

        start_url: "/kanjii/",
        scope: "/kanjii/",

        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
    spaFallback(),
  ],
  build: {
    outDir: "docs",
  },
});
