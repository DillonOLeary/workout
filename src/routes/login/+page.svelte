<script lang="ts">
	import { enhance } from '$app/forms';
	import { Caption, Note, Primary } from '$lib/ui';
</script>

<div class="login">
	<div class="stack">
		<div>
			<div class="wordmark">LEDGER</div>
			<div class="underline"></div>
			<p class="tagline">Show up. Write it down.</p>
		</div>
		<form method="POST" use:enhance>
			<label class="phone">
				<Caption>Phone number</Caption>
				<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 015-5309" />
			</label>
			<Primary type="submit">Enter</Primary>
		</form>
		<Note size="sm" tone="stone">No password. Your number is your key — this device stays signed in.</Note>
	</div>
</div>

<style>
	.login { min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 20px; padding-top: clamp(48px, 14vh, 140px); }
	.stack { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 32px; text-align: center; }
	.stack :global(.note) { text-align: center; }
	.wordmark { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 64px; line-height: 1; letter-spacing: var(--tracking-tightish); text-align: left; }
	.underline { height: 10px; width: 140px; background: var(--volt); border: var(--border-w) solid var(--ink); margin-top: 8px; }
	.tagline { margin: 20px 0 0; font-size: 17px; color: var(--slate); text-align: left; }
	form { display: flex; flex-direction: column; gap: 24px; }
	.phone { display: flex; flex-direction: column; gap: 8px; text-align: left; }
	input {
		min-height: 56px; padding: 0 16px; font-family: var(--font-mono); font-size: 22px; color: var(--ink);
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-md); box-shadow: var(--shadow-card);
	}
	input::placeholder { color: var(--stone); opacity: 0.7; }
</style>
