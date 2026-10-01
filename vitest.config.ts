import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: that one loads the SvelteKit plugin, whose wrangler emulation reads .env.local.
// The plain Svelte plugin is here for the floor's `.svelte.ts` modules, whose runes the compiler has to see.
export default defineConfig({
	plugins: [svelte({ configFile: false })],
	resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
	test: { include: ['src/**/*.test.ts'], environment: 'node' }
});
