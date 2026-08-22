import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
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

// Dev only. Vite answers any directory-style URL with the app's index.html (the
// SPA fallback), so /features/, /faq/ and /privacy/ — real files in public/ that
// a build and `npm run preview` serve correctly — came back as the app, which
// then showed "Page not found". robots.txt and sitemap.xml were unaffected
// because they're exact filenames. This makes dev behave like the deploy.
const servePublicDirIndex = () => ({
  name: "serve-public-dir-index",
  apply: "serve" as const,
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? "").split("?")[0];
      if (!path.endsWith("/") || path.includes("..")) return next();
      const file = resolve(__dirname, "public", `.${path}`, "index.html");
      if (!existsSync(file)) return next();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(readFileSync(file));
    });
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
      // "prompt", not "autoUpdate". The registration vite-plugin-pwa generates
      // for autoUpdate listens for the new worker activating and immediately
      // calls window.location.reload() — so pushing a deploy reloaded every open
      // tab mid-session, losing a graded card, a half-typed word or a half-drawn
      // kanji with no warning. With "prompt" the waiting worker is announced
      // instead (main.tsx → lib/swUpdate → components/update-toast) and the user
      // chooses when. Nothing auto-injects a registration at this setting, so
      // main.tsx's registerSW stays the only one.
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      workbox: {
        // The word list (~433 KB gzipped) is only needed by the Read page. Left
        // in the precache it more than doubled the install — 1,049 KB to 2,499 KB
        // — for every user, including those who never open it. Excluded here and
        // cached at runtime below instead, the same deal the stroke files get.
        globIgnores: ["**/dictionary-*.js"],
        // Real files in public/, not app routes. Workbox otherwise answers every
        // navigation with the precached index.html, so once the service worker
        // was active these URLs served the app shell instead of the page — the
        // router found no match and showed "Page not found". /privacy/ had this
        // from the day it was added; it just rendered blank rather than an error,
        // so nobody noticed. Crawlers don't run service workers, which is why the
        // pages looked fine from outside.
        //
        // Add any future static page here as well as to sitemap.xml.
        navigateFallbackDenylist: [
          /^\/privacy\//,
          /^\/features\//,
          /^\/faq\//,
          /^\/robots\.txt$/,
          /^\/sitemap\.xml$/,
        ],
        // 6,700+ KanjiVG stroke files (~44 MB) are too many to precache, so they
        // are fetched on demand. Cache each one the first time it's requested so
        // writing/stroke practice for any kanji you've opened works offline too.
        runtimeCaching: [
          {
            // The subset mincho face (~488 KB). Runtime-cached rather than
            // precached, the same call made for the dictionary above: it is used
            // on the kanji and word pages, not on first paint, so it shouldn't
            // be on every install's critical path. Fetched the first time one of
            // those pages renders, offline from then on.
            //
            // Unhashed (it lives in public/), so a regenerated font must be
            // given a new filename or this CacheFirst entry will serve the old
            // one for a year. See README "Attribution".
            urlPattern: /\/fonts\/.*\.woff2$/,
            handler: "CacheFirst",
            options: {
              cacheName: "kanjii-fonts",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
    servePublicDirIndex(),
  ],
  build: {
    outDir: "docs",
  },
});
