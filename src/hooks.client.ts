import type { HandleClientError } from '@sveltejs/kit';
import { NO_CONNECTION, isNetworkError } from '$lib/net';

/** a navigation whose data never arrived says so — the error page reads "no connection", not "something broke" */
export const handleError: HandleClientError = ({ error, message }) => {
	console.error(error);
	return { message: isNetworkError(error instanceof Error ? error.message : undefined) ? NO_CONNECTION : message };
};
