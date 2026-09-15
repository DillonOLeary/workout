import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// wrangler's dev emulation of the HYPERDRIVE binding needs a Postgres string in process.env, which Vite never fills from .env files: bridge it from DB.
	const env = loadEnv(mode, process.cwd(), '');
	process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??= env.DB;

	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode except for libraries; can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				adapter: adapter()
			})
		]
	};
});
