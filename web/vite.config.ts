import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Standalone static build for GitHub Pages (gh-pages branch of this repo).
export default defineConfig({
  root: "web",
  base: "/tata/",
  publicDir: "../public",
  plugins: [
    react(),
    // offline app shell: everything is local anyway (drafts in IndexedDB,
    // fonts bundled, Obsidian on 127.0.0.1) — the shell should be too
    VitePWA({
      // prompt, never autoUpdate: a writing app must not reload mid-sentence
      registerType: "prompt",
      manifest: false, // public/manifest.webmanifest already exists
      workbox: {
        // prompt flow: wait until told (no skipWaiting), but once told,
        // claim the open pages so controllerchange fires and we reload
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        navigateFallback: "/tata/index.html",
        runtimeCaching: [],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
});
