import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	foregroundAnsi,
	isAppleTerminalSession,
	rgbColor,
	visibleWidth,
	type Color,
	type Component,
	type TUI,
} from "@earendil-works/pi-tui";
import { readMergedSettings } from "../../settings/store.ts";

export const STARTUP_STYLES = ["tetris", "matrix", "fireworks", "wave", "retro"] as const;
export type StartupStyle = (typeof STARTUP_STYLES)[number];

const FRAME_MS = 30;
const FALL_INTERVAL_MS = 85;
const HOLD_MS = 900;
const MOVE_MS = 700;

type StartupStage = "warmup" | "animating" | "holding" | "moving" | "landing";

const PIXELS = [
	["c", "c", "c", "."],
	["b", ".", "c", "."],
	["b", "b", ".", "y"],
	["b", ".", ".", "y"],
] as const;

const CELL_W = 4;
const CELL_H = 2;
const GRID_COLS = 6;
const GRID_ROWS = 5;
const LOGO_WIDTH = GRID_COLS * CELL_W;
const LOGO_HEIGHT = GRID_ROWS * CELL_H;

interface Piece {
	color: Color;
	cells: ReadonlyArray<readonly [number, number]>;
}

const PIECES: readonly Piece[] = [
	{
		color: rgbColor(135, 206, 212),
		cells: [[4, 0], [4, 1], [4, 2], [4, 3]],
	},
	{
		color: rgbColor(79, 142, 179),
		cells: [[1, 1], [2, 1], [3, 1], [2, 2]],
	},
	{
		color: rgbColor(228, 138, 122),
		cells: [[0, 1], [0, 2], [0, 3], [1, 3]],
	},
	{
		color: rgbColor(234, 182, 93),
		cells: [[2, 4], [3, 4], [4, 4], [4, 5]],
	},
];

interface Schedule {
	start: number;
	land: number;
	fall: number;
}

function buildSchedule(headroom: number): { schedule: Schedule[]; end: number } {
	let tick = 2;
	const schedule = PIECES.map((piece) => {
		const minRow = Math.min(...piece.cells.map(([row]) => row));
		const fall = minRow + headroom;
		const start = tick;
		const land = start + fall;
		tick = land + 1;
		return { start, land, fall };
	});
	return { schedule, end: tick + 8 };
}

interface Glyph {
	ch: string;
	fg: Color;
}

function buildTargetLogoGrid(): Array<Array<Glyph | null>> {
	const grid: Array<Array<Glyph | null>> = Array.from(
		{ length: LOGO_HEIGHT },
		() => Array<Glyph | null>(LOGO_WIDTH).fill(null),
	);
	const put = (row: number, col: number, glyph: Glyph) => {
		if (row >= 0 && row < LOGO_HEIGHT && col >= 0 && col < LOGO_WIDTH) grid[row]![col] = glyph;
	};
	for (let row = 0; row < PIXELS.length; row++) {
		for (let col = 0; col < PIXELS[row]!.length; col++) {
			const key = PIXELS[row]![col];
			if (key === ".") continue;
			const color = key === "c"
				? rgbColor(228, 138, 122)
				: key === "b"
					? rgbColor(79, 142, 179)
					: rgbColor(234, 182, 93);
			for (let dr = 0; dr < CELL_H; dr++) {
				for (let dc = 0; dc < CELL_W; dc++) {
					put((row + 1) * CELL_H + dr, (col + 1) * CELL_W + dc, { ch: "█", fg: color });
				}
			}
		}
	}
	return grid;
}

const targetGrid = buildTargetLogoGrid();

function gridToLines(grid: Array<Array<Glyph | null>>, mode: string): string[] {
	return grid.map((row) => {
		let line = "";
		let current = "";
		for (const cell of row) {
			const ansi = cell?.fg ? foregroundAnsi(cell.fg, mode as any) : "";
			if (ansi !== current) {
				line += current ? "\x1b[0m" : "";
				line += ansi;
				current = ansi;
			}
			line += cell ? cell.ch : " ";
		}
		return current ? line + "\x1b[0m" : line;
	});
}

function logoLinesTetris(mode: string, tick: number | null, schedule: Schedule[], headroom: number): string[] {
	const oy = tick == null ? 0 : headroom * CELL_H;
	const height = LOGO_HEIGHT + oy;
	const grid: Array<Array<Glyph | null>> = Array.from(
		{ length: height },
		() => Array<Glyph | null>(LOGO_WIDTH).fill(null),
	);

	const put = (row: number, col: number, glyph: Glyph) => {
		if (row >= 0 && row < height && col >= 0 && col < LOGO_WIDTH) grid[row]![col] = glyph;
	};

	if (tick == null) {
		for (let row = 0; row < PIXELS.length; row++) {
			for (let col = 0; col < PIXELS[row]!.length; col++) {
				const key = PIXELS[row]![col];
				if (key === ".") continue;
				const color = key === "c"
					? rgbColor(228, 138, 122)
					: key === "b"
						? rgbColor(79, 142, 179)
						: rgbColor(234, 182, 93);
				for (let dr = 0; dr < CELL_H; dr++) {
					for (let dc = 0; dc < CELL_W; dc++) {
						put((row + 1) * CELL_H + dr, (col + 1) * CELL_W + dc, { ch: "█", fg: color });
					}
				}
			}
		}
	} else {
		PIECES.forEach((piece, index) => {
			const item = schedule[index]!;
			if (tick < item.start) return;
			const d = Math.max(0, item.fall - (tick - item.start));
			for (const [row, col] of piece.cells) {
				const tr = (row - d + headroom) * 2;
				const tc = col * CELL_W;
				for (let dr = 0; dr < CELL_H; dr++) {
					for (let dc = 0; dc < CELL_W; dc++) {
						put(tr + dr, tc + dc, { ch: "█", fg: piece.color });
					}
				}
			}
		});
	}

	return gridToLines(grid, mode);
}

function renderMatrixLines(mode: string, tick: number | null, headroom: number): string[] {
	const oy = tick == null ? 0 : headroom * CELL_H;
	const height = LOGO_HEIGHT + oy;
	const grid: Array<Array<Glyph | null>> = Array.from(
		{ length: height },
		() => Array<Glyph | null>(LOGO_WIDTH).fill(null),
	);

	const t = tick == null ? 50 : Math.max(0, tick);
	const matrixChars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "█", "▓", "▒"];

	for (let r = 0; r < height; r++) {
		for (let c = 0; c < LOGO_WIDTH; c++) {
			const targetRow = r - (tick == null ? 0 : headroom * CELL_H);
			const target = (targetRow >= 0 && targetRow < LOGO_HEIGHT) ? targetGrid[targetRow]![c] : null;

			if (target && t >= 10 + Math.floor((targetRow / LOGO_HEIGHT) * 15)) {
				grid[r]![c] = target;
			} else {
				const rainActive = (r + c * 3 + t * 2) % 17;
				if (rainActive < 5) {
					const greenShades = [
						rgbColor(0, 255, 100),
						rgbColor(0, 200, 80),
						rgbColor(0, 140, 50),
					];
					const ch = matrixChars[(r + c + t) % matrixChars.length]!;
					const fg = greenShades[(r + t) % greenShades.length]!;
					grid[r]![c] = { ch, fg };
				}
			}
		}
	}

	return gridToLines(grid, mode);
}

function renderFireworksLines(mode: string, tick: number | null, headroom: number): string[] {
	const oy = tick == null ? 0 : headroom * CELL_H;
	const height = LOGO_HEIGHT + oy;
	const grid: Array<Array<Glyph | null>> = Array.from(
		{ length: height },
		() => Array<Glyph | null>(LOGO_WIDTH).fill(null),
	);

	const t = tick == null ? 35 : Math.max(0, tick);
	const cx = Math.floor(LOGO_WIDTH / 2);
	const cy = Math.floor(LOGO_HEIGHT / 2);

	for (let tr = 0; tr < LOGO_HEIGHT; tr++) {
		for (let c = 0; c < LOGO_WIDTH; c++) {
			const target = targetGrid[tr]![c];
			if (!target) continue;

			const r = tr + headroom * CELL_H;
			if (t < 12) {
				const angle = (tr * 13 + c * 7) % 360;
				const dist = (12 - t) * 1.5;
				const pr = Math.round(cy + headroom * CELL_H + Math.sin(angle) * dist);
				const pc = Math.round(cx + Math.cos(angle) * dist);
				if (pr >= 0 && pr < height && pc >= 0 && pc < LOGO_WIDTH) {
					grid[pr]![pc] = { ch: "*", fg: rgbColor(255, 220, 100) };
				}
			} else {
				const progress = Math.min(1, (t - 12) / 15);
				const angle = (tr * 13 + c * 7) % 360;
				const startDist = 18;
				const curDist = startDist * (1 - progress);
				const pr = Math.round(r + Math.sin(angle) * curDist);
				const pc = Math.round(c + Math.cos(angle) * curDist);
				if (pr >= 0 && pr < height && pc >= 0 && pc < LOGO_WIDTH) {
					grid[pr]![pc] = progress > 0.8 ? target : { ch: "+", fg: target.fg };
				}
			}
		}
	}

	return gridToLines(grid, mode);
}

function renderWaveLines(mode: string, tick: number | null, headroom: number): string[] {
	const oy = tick == null ? 0 : headroom * CELL_H;
	const height = LOGO_HEIGHT + oy;
	const grid: Array<Array<Glyph | null>> = Array.from(
		{ length: height },
		() => Array<Glyph | null>(LOGO_WIDTH).fill(null),
	);

	const t = tick == null ? 30 : Math.max(0, tick);
	const scanRow = Math.floor((t / 25) * height);

	for (let r = 0; r < height; r++) {
		for (let c = 0; c < LOGO_WIDTH; c++) {
			const targetRow = r - headroom * CELL_H;
			const target = (targetRow >= 0 && targetRow < LOGO_HEIGHT) ? targetGrid[targetRow]![c] : null;

			if (r <= scanRow && target) {
				grid[r]![c] = target;
			} else if (r === scanRow + 1) {
				grid[r]![c] = { ch: "░", fg: rgbColor(150, 220, 255) };
			} else {
				if (targetRow >= 0 && targetRow < LOGO_HEIGHT && (targetRow + c + t) % 5 === 0) {
					grid[r]![c] = { ch: ".", fg: rgbColor(50, 80, 110) };
				}
			}
		}
	}

	return gridToLines(grid, mode);
}

function renderRetroLines(mode: string, tick: number | null, headroom: number): string[] {
	const oy = tick == null ? 0 : headroom * CELL_H;
	const height = LOGO_HEIGHT + oy;
	const grid: Array<Array<Glyph | null>> = Array.from(
		{ length: height },
		() => Array<Glyph | null>(LOGO_WIDTH).fill(null),
	);

	const t = tick == null ? 30 : Math.max(0, tick);
	const glitchNoise = t < 15 ? (15 - t) / 15 : 0;

	for (let r = 0; r < height; r++) {
		const targetRow = r - headroom * CELL_H;
		const rowOffset = glitchNoise > 0 && Math.random() < glitchNoise * 0.4 ? Math.floor((Math.random() - 0.5) * 8) : 0;

		for (let c = 0; c < LOGO_WIDTH; c++) {
			const srcCol = Math.max(0, Math.min(LOGO_WIDTH - 1, c + rowOffset));
			const target = (targetRow >= 0 && targetRow < LOGO_HEIGHT) ? targetGrid[targetRow]![srcCol] : null;

			if (glitchNoise > 0.5 && Math.random() < glitchNoise * 0.3) {
				const staticChars = ["#", "/", "\\", "x", "-", "=", "+"];
				const ch = staticChars[Math.floor(Math.random() * staticChars.length)]!;
				grid[r]![c] = { ch, fg: rgbColor(200, 50, 50) };
			} else if (target) {
				grid[r]![c] = target;
			} else if (glitchNoise > 0 && Math.random() < 0.1) {
				grid[r]![c] = { ch: "·", fg: rgbColor(100, 100, 100) };
			}
		}
	}

	return gridToLines(grid, mode);
}

function renderScaledLogoLines(mode: string, cellW: number, cellH: number): string[] {
	const width = GRID_COLS * cellW;
	const height = GRID_ROWS * cellH;
	const grid: Array<Array<Glyph | null>> = Array.from(
		{ length: height },
		() => Array<Glyph | null>(width).fill(null),
	);
	const put = (row: number, col: number, glyph: Glyph) => {
		if (row >= 0 && row < height && col >= 0 && col < width) grid[row]![col] = glyph;
	};
	for (let row = 0; row < PIXELS.length; row++) {
		for (let col = 0; col < PIXELS[row]!.length; col++) {
			const key = PIXELS[row]![col];
			if (key === ".") continue;
			const color = key === "c"
				? rgbColor(228, 138, 122)
				: key === "b"
					? rgbColor(79, 142, 179)
					: rgbColor(234, 182, 93);
			for (let dr = 0; dr < cellH; dr++) {
				for (let dc = 0; dc < cellW; dc++) {
					put((row + 1) * cellH + dr, (col + 1) * cellW + dc, { ch: "█", fg: color });
				}
			}
		}
	}
	return gridToLines(grid, mode);
}

const scheduleCache = new Map<number, { schedule: Schedule[]; end: number }>();

function getSchedule(headroom: number): { schedule: Schedule[]; end: number } {
	let cached = scheduleCache.get(headroom);
	if (!cached) {
		cached = buildSchedule(headroom);
		scheduleCache.set(headroom, cached);
	}
	return cached;
}

function getStyleEnd(style: string, headroom: number): number {
	if (style === "matrix") return 45;
	if (style === "fireworks") return 40;
	if (style === "wave") return 35;
	if (style === "retro") return 35;
	return getSchedule(headroom).end;
}

function renderLogoLines(style: string, mode: string, tick: number | null, headroom: number): string[] {
	if (style === "matrix") {
		return renderMatrixLines(mode, tick, headroom);
	}
	if (style === "fireworks") {
		return renderFireworksLines(mode, tick, headroom);
	}
	if (style === "wave") {
		return renderWaveLines(mode, tick, headroom);
	}
	if (style === "retro") {
		return renderRetroLines(mode, tick, headroom);
	}
	return logoLinesTetris(mode, tick, getSchedule(headroom).schedule, headroom);
}

class StartupAnimation implements Component {
	private stage: StartupStage = "warmup";
	private tick = 0;
	private clockNow = 0;
	private lastReal = Date.now();
	private started = Date.now();
	private stageStarted = 0;
	private timer: ReturnType<typeof setInterval> | undefined;
	private finished = false;
	private readonly headroom: number;
	private readonly end: number;
	private readonly style: string;
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly done: () => void;

	constructor(tui: TUI, theme: Theme, done: () => void, style: string) {
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.style = style;
		const rows = Math.max(1, tui.terminal.rows || 24);
		this.headroom = Math.max(1, Math.min(3, Math.floor((rows - LOGO_HEIGHT) / (2 * 2))));
		this.end = getStyleEnd(this.style, this.headroom);
		this.timer = setInterval(() => this.advance(), FRAME_MS);
		this.timer.unref?.();
	}

	private stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	private finish(): void {
		if (this.finished) return;
		this.finished = true;
		this.stop();
		this.done();
	}

	private advance(): void {
		if (this.finished) return;
		const real = Date.now();
		const realDt = real - this.lastReal;
		this.lastReal = real;
		this.clockNow += Math.min(realDt, 40);
		const now = this.clockNow;

		if (this.stage === "warmup") {
			if (real - this.started >= 650) {
				this.stage = "animating";
				this.stageStarted = now;
				this.tui.requestRender();
			}
			return;
		}
		if (this.stage === "animating") {
			const elapsed = now - this.stageStarted;
			const nextTick = Math.min(this.end, Math.floor(elapsed / FALL_INTERVAL_MS));
			if (nextTick !== this.tick) {
				this.tick = nextTick;
				this.tui.requestRender();
			}
			if (nextTick >= this.end) {
				this.stage = "holding";
				this.stageStarted = now;
				this.tick = this.end;
				this.tui.requestRender();
			}
			return;
		}
		if (this.stage === "holding") {
			if (now - this.stageStarted >= HOLD_MS) {
				this.stage = "moving";
				this.stageStarted = now;
			}
			return;
		}
		if (this.stage === "moving") {
			if (now - this.stageStarted >= MOVE_MS) this.stage = "landing";
			this.tui.requestRender();
			return;
		}
		this.finish();
	}

	invalidate(): void {}
	dispose(): void {
		this.stop();
	}
	handleInput(_data: string): void {
		this.finish();
	}

	render(width: number): string[] {
		const height = Math.max(1, this.tui.terminal.rows || 24);
		const centerX = Math.max(0, Math.floor((width - LOGO_WIDTH) / 2));
		const centerY = Math.max(0, Math.floor((height - LOGO_HEIGHT) / 2));

		const moving = this.stage === "moving";
		const landing = this.stage === "landing";
		let x = centerX;
		let y = centerY;
		let scale = 1;

		if (moving) {
			const progress = Math.max(0, Math.min(1, (this.clockNow - this.stageStarted) / MOVE_MS));
			const targetX = 3;
			const targetY = 1;
			const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2;
			x = centerX + (targetX - centerX) * eased;
			y = centerY + (targetY - centerY) * eased - Math.sin(progress * Math.PI);
			scale = 1 - 0.5 * eased;
		} else if (landing) {
			x = 3;
			y = 1;
			scale = 0.5;
		}

		const cellW = Math.max(2, Math.round(CELL_W * scale));
		const cellH = Math.max(1, Math.round(CELL_H * scale));
		const currentLogoWidth = GRID_COLS * cellW;
		const tick = this.stage === "warmup" ? -1 : this.stage === "animating" ? this.tick : null;
		const mode = this.theme.getColorMode() as any;
		const lines = (moving || landing)
			? renderScaledLogoLines(mode, cellW, cellH)
			: renderLogoLines(this.style, mode, tick, this.headroom);
		const yOffset = tick == null ? 0 : this.headroom * CELL_H;
		const safeX = Math.max(0, Math.min(width - currentLogoWidth, Math.round(x)));
		const safeY = Math.max(0, Math.round(y - yOffset));
		const blankLine = " ".repeat(width);
		const out = new Array<string>(height).fill(blankLine);

		for (let i = 0; i < lines.length; i++) {
			const row = safeY + i;
			if (row < 0 || row >= height) continue;
			const drawn = " ".repeat(safeX) + lines[i]!;
			out[row] = drawn + " ".repeat(Math.max(0, width - visibleWidth(drawn)));
		}
		return out;
	}
}

export function getStartupStyle(): string {
	const settings = readMergedSettings();
	const val = settings.startupAnimation;
	if (val === undefined || val === false || val === "off") return "off";
	if (val === true || val === "on") return "tetris";
	if (typeof val === "string") {
		const lower = val.toLowerCase();
		if ((STARTUP_STYLES as readonly string[]).includes(lower)) return lower;
		if (lower === "true" || lower === "on") return "tetris";
		if (lower === "off" || lower === "false") return "off";
	}
	return "off";
}

export async function playStartupAnimation(
	event: { reason?: string },
	ctx: any,
): Promise<void> {
	if (
		event.reason !== "startup"
		|| ctx.mode !== "tui"
		|| !ctx.hasUI
		|| isAppleTerminalSession()
	) return;

	const style = getStartupStyle();
	if (style === "off") return;

	await ctx.ui.custom(
		(tui: TUI, theme: Theme, _keybindings: unknown, done: (result: void) => void) =>
			new StartupAnimation(tui, theme, done, style),
		{
			overlay: true,
			overlayOptions: {
				width: "100%",
				maxHeight: "100%",
				row: 0,
				col: 0,
			},
		},
	);
}
