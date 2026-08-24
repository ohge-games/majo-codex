import { defineConfig, passthroughImageService } from 'astro/config';
export default defineConfig({
  site: 'https://majo.pages.dev',
  image: { service: passthroughImageService() },
});
