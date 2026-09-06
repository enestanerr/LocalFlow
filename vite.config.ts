import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [
    vinext(),
    ...(existsSync(new URL('./.openai/hosting.json', import.meta.url))
      ? [sites()]
      : []),
  ],
});
