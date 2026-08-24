import { redirect } from '@sveltejs/kit';

/** /why moved under The Plan — permanent, so old links keep working. */
export const load = () => {
	redirect(301, '/plan/why');
};
