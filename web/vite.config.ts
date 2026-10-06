import { defineConfig } from 'vite';

// phones.json is written by phones.py before dev and build
// base './' keeps every url relative, so the build runs under any path, such as atlas's /case/
export default defineConfig({ base: './', server: { host: true } });
