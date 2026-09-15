// browsers only play audio after a gesture, so the primary arms the bell on every press and the clock rings it later
let ctx: AudioContext | null = null;

/** Call from a tap handler: opens (or wakes) the audio context while the gesture is live. */
export function armBell(): void {
	try {
		ctx ??= new AudioContext();
		if (ctx.state === 'suspended') void ctx.resume();
	} catch {
		ctx = null;
	}
}

export function ringBell(): void {
	navigator.vibrate?.([30, 40, 30]);
	if (!ctx || ctx.state !== 'running') return;
	const t = ctx.currentTime;
	[880, 1175].forEach((hz, i) => {
		const at = t + i * 0.13;
		const o = ctx!.createOscillator();
		const g = ctx!.createGain();
		o.type = 'sine';
		o.frequency.value = hz;
		g.gain.setValueAtTime(0.0001, at);
		g.gain.exponentialRampToValueAtTime(0.18, at + 0.012);
		g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
		o.connect(g).connect(ctx!.destination);
		o.start(at);
		o.stop(at + 0.3);
	});
}
