declare global {
	namespace App {
		interface Locals {
			/** signed-in user, verified from the auth cookie in hooks.server.ts */
			uid?: string;
		}
		interface Platform {
			env?: {
				HYPERDRIVE?: { connectionString: string };
			};
		}
	}
}

export {};
