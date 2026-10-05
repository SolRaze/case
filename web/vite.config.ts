import { defineConfig } from 'vite';

// phones.json is written by phones.py before dev and build
export default defineConfig({ server: { host: true } });
