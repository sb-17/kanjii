import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

// Build stamp, shown on the About page. The point is to tell at a glance whether
// the installed PWA is actually running the build you just pushed — a service
// worker can keep serving an old one, which has already cost a debugging session.
// `package.json`'s version is not used: it would need bumping by hand and says
// nothing about which commit is deployed.
const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown"; // no git (e.g. building from a source archive)
  }
})();

// GitHub Pages has no SPA rewrite, so deep links / refreshes on client routes
// (e.g. /kanji) would 404. Serving a 404.html that's a copy of index.html
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
  // Served from the apex of kanjii.org, so the app sits at the root. It used to
  // be "/kanjii/" for the sb-17.github.io project page; `public/CNAME` is what
  // keeps the custom domain attached across rebuilds, since the build wipes
  // docs/ and GitHub stores the domain in that file.
  base: "/",
  define: {
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      workbox: {
        // The word list (~433 KB gzipped) is only needed by the Read page. Left
        // in the precache it more than doubled the install — 1,049 KB to 2,499 KB
        // — for every user, including those who never open it. Excluded here and
        // cached at runtime below instead, the same deal the stroke files get.
        globIgnores: ["**/dictionary-*.js"],
        // 6,700+ KanjiVG stroke files (~44 MB) are too many to precache, so they
        // are fetched on demand. Cache each one the first time it's requested so
        // writing/stroke practice for any kanji you've opened works offline too.
        runtimeCaching: [
          {
            // Fetched once, when Read is first opened; offline from then on.
            urlPattern: /\/assets\/dictionary-.*\.js$/,
            handler: "CacheFirst",
            options: {
              cacheName: "kanjii-dictionary",
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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

        start_url: "/",
        scope: "/",

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
