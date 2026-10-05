<script lang="ts">
	import { goto } from '$app/navigation';
	import { Note, Primary } from '$lib/ui';
	import { passkey } from '$lib/passkey';

	let busy = $state(false);
	let message = $state<string | null>(null);
	async function go(kind: 'signin' | 'signup') {
		busy = true;
		message = null;
		const r = await passkey(kind);
		busy = false;
		if (r.ok) await goto('/', { replaceState: true, invalidateAll: true });
		else message = r.message;
	}
</script>

<div class="login">
	<div class="stack">
		<div>
			<h1 class="wordmark">LEDGER</h1>
			<div class="underline"></div>
			<p class="tagline">Show up. Write it down.</p>
		</div>
		<div class="act">
			<Primary type="button" disabled={busy} onclick={() => go('signin')}>Sign in with a passkey</Primary>
			{#if message}<p class="err" role="alert">{message}</p>{/if}
		</div>
		<Note size="sm" tone="stone">Face ID, a fingerprint or a security key. No password — this device stays signed in.</Note>
		<Note size="sm" onclick={busy ? undefined : () => go('signup')}>New here? Start a ledger with a passkey</Note>
	</div>
</div>

<style>
	.login { min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 20px; padding-top: clamp(48px, 14vh, 140px); }
	.stack { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 24px; text-align: center; }
	.stack :global(.note) { text-align: center; }
	.stack :global(.note.tap) { align-self: center; }
	.wordmark { margin: 0; font-family: var(--font-display); font-weight: var(--weight-black); font-size: 64px; line-height: 1; letter-spacing: var(--tracking-tightish); text-align: left; }
	.underline { height: 10px; width: 140px; background: var(--volt); border: var(--border-w) solid var(--ink); margin-top: 8px; }
	.tagline { margin: 20px 0 8px; font-size: 17px; color: var(--slate); text-align: left; }
	.act { display: flex; flex-direction: column; gap: 14px; }
	.err { margin: 0; font-family: var(--font-mono); font-size: 13px; line-height: 1.5; font-weight: 700; color: var(--signal); }
</style>
