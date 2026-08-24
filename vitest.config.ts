import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Deliberately NOT vite.config.ts: that one loads the SvelteKit plugin, which
 * pulls in adapter-cloudflare's wrangler emulation and reads .env.local. The
 * domain under test (decider, projections, racks) is pure TypeScript with no
 * I/O, so the suite needs only the $lib alias and a Node environment.
 */
export default defineConfig({
	resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
	test: { include: ['src/**/*.test.ts'], environment: 'node' }
});
