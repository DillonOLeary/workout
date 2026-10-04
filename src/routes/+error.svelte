<script lang="ts">
	import { page } from '$app/state';
	import { Note, Primary, Title } from '$lib/ui';
	import { isNetworkError } from '$lib/net';

	/** A load or an action threw — a database that is waking up, a lost connection — or the URL is nobody's. The stream is untouched either way. */
	let notFound = $derived(page.status === 404);
	let offline = $derived(!notFound && isNetworkError(page.error?.message));
</script>

<div class="wrap">
	<div class="stack">
		<Title>{notFound ? 'Nothing here' : offline ? 'No connection' : 'Something broke'}</Title>
		<Note>{notFound ? 'That page is not one of the three tabs.' : offline ? 'The phone couldn’t reach the server, so nothing was sent. Try again when you’re back online — sets on the floor wait on the phone.' : `${page.status}: ${page.error?.message ?? 'no message'}. Nothing was written; try again in a moment.`}</Note>
		<!-- a full load, not a client-side goto: the failed request is the one to repeat -->
		<Primary onclick={() => location.assign('/')}>{notFound ? 'Today' : 'Try again'}</Primary>
	</div>
</div>

<style>
	.wrap { min-height: 100vh; display: flex; justify-content: center; padding: 20px; padding-top: clamp(48px, 14vh, 140px); }
	.stack { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 24px; }
</style>
