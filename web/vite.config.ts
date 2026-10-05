import { defineConfig } from 'vite';

// src/data.ts imports ../rules.json, ../styles.json and ../ref/iphone/sizes.json at build time
export default defineConfig({
  server: { fs: { allow: ['..'] }, host: true },
});
