import { defineConfig } from 'vite';
import vinext from 'vinext';
import { cloudflare } from '@cloudflare/vite-plugin';

// Ne crée ni D1, ni KV, ni Images. Turso reste la seule base applicative.
export default defineConfig({
  server: {allowedHosts:['.e2b.app']},
  preview: {allowedHosts:['.e2b.app']},
  plugins: [
    vinext(),
    cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']}}),
  ],
});
