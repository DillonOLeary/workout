import { GRID, type Frame } from './rig';

/** a dot's radius as a fraction of its pitch */
const DOT = 0.34;

/** one frame on a canvas: the grid fills the shorter side, centred, in the given ink */
export function stamp(ctx: CanvasRenderingContext2D, f: Frame, w: number, h: number, dpr: number, ink: string): void {
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, w, h);
	const side = Math.min(w, h), pitch = side / GRID, r = DOT * pitch;
	const ox = (w - side) / 2, oy = (h - side) / 2;
	ctx.fillStyle = ink;
	for (let row = 0; row < GRID; row++) {
		for (let col = 0; col < GRID; col++) {
			if (f[row][col] !== '#') continue;
			ctx.beginPath();
			ctx.arc(ox + (col + 0.5) * pitch, oy + (row + 0.5) * pitch, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}
