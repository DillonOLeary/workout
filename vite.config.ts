import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// `pnpm dev` emulates the Worker bindings from wrangler.jsonc, and wrangler
	// refuses to emulate the HYPERDRIVE binding without a Postgres string — read
	// from process.env ONLY, which Vite never populates from .env files. Bridge
	// the gap here (vite.config runs before the first request triggers
	// emulation): point local "Hyperdrive" straight at Neon, so DB stays the
	// one secret and hooks.server.ts's Hyperdrive branch runs in dev too.
	const env = loadEnv(mode, process.cwd(), '');
	process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??= env.DB;

	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				// Deployed to Cloudflare Workers — config lives in wrangler.jsonc.
				adapter: adapter()
			})
		]
	};
});
