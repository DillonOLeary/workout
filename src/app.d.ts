// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** signed-in user, verified from the auth cookie in hooks.server.ts */
			uid?: string;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: {
				HYPERDRIVE?: { connectionString: string };
			};
		}
	}
}

export {};
