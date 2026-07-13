<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import PhoneInput from '$lib/components/PhoneInput.svelte';

	let phone = $state('');
</script>

<div class="login">
	<div class="stack">
		<div>
			<div class="wordmark">LEDGER</div>
			<div class="underline"></div>
			<p class="tagline">Track the work. The rule does the rest.</p>
		</div>

		<form method="POST" use:enhance>
			<PhoneInput bind:value={phone} />
			<Button variant="accent" size="lg" type="submit" style="width: 100%">Enter</Button>
		</form>

		<p class="foot">No password. Your number becomes a private URL — bookmark it.</p>
	</div>
</div>

<style>
	.login {
		min-height: 100vh;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: var(--page-pad);
		/* top-weighted, not dead-centered — the wordmark shouldn't float mid-screen */
		padding-top: clamp(48px, 14vh, 140px);
	}
	.stack { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 32px; }
	.wordmark {
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-hero);
		line-height: 1;
		letter-spacing: var(--tracking-tightish);
	}
	.underline { height: 10px; width: 140px; background: var(--volt); border: var(--border-w) solid var(--ink); margin-top: 8px; }
	.tagline { margin: 20px 0 0; font-size: var(--text-md); color: var(--ink-2); }
	form { display: flex; flex-direction: column; gap: 24px; }
	.foot { margin: 0; font-size: var(--text-sm); color: var(--ink-3); text-align: center; }
</style>
