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

const FRAME_MS = 30;
const FALL_INTERVAL_MS = 85;
const HOLD_MS = 900;
const MOVE_MS = 700;

type StartupStage = "warmup" | "falling" | "holding" | "moving" | "landing";

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

function logoLines(mode: "rgb" | "ansi" | "truecolor" | "default", tick: number | null, schedule: Schedule[], headroom: number): string[] {
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

	return grid.map((row) => {
		let line = "";
		let current = "";
		for (const cell of row) {
			const ansi = cell ? foregroundAnsi(cell.fg, mode as any) : "";
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
	private readonly schedule: Schedule[];
	private readonly end: number;
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly done: () => void;

	constructor(tui: TUI, theme: Theme, done: () => void) {
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		const rows = Math.max(1, tui.terminal.rows || 24);
		this.headroom = Math.max(1, Math.min(3, Math.floor((rows - LOGO_HEIGHT) / (2 * 2))));
		const timeline = buildSchedule(this.headroom);
		this.schedule = timeline.schedule;
		this.end = timeline.end;
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
				this.stage = "falling";
				this.stageStarted = now;
			}
			this.tui.requestRender();
			return;
		}
		if (this.stage === "falling") {
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

	render(width: number): string[] {
		const height = Math.max(1, this.tui.terminal.rows || 24);
		const centerX = Math.max(0, Math.floor((width - LOGO_WIDTH) / 2));
		const centerY = Math.max(0, Math.floor((height - LOGO_HEIGHT) / 2));

		const moving = this.stage === "moving";
		let x = centerX;
		let y = centerY;

		if (moving) {
			const progress = Math.max(0, Math.min(1, (this.clockNow - this.stageStarted) / MOVE_MS));
			const targetX = 3;
			const targetY = 1;
			const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2;
			x = centerX + (targetX - centerX) * eased;
			y = centerY + (targetY - centerY) * eased - Math.sin(progress * Math.PI);
		} else if (this.stage === "landing") {
			x = 3;
			y = 1;
		}

		const tick = this.stage === "warmup" ? -1 : this.stage === "falling" ? this.tick : null;
		const lines = logoLines(this.theme.getColorMode() as any, tick, this.schedule, this.headroom);
		const yOffset = tick == null ? 0 : this.headroom * CELL_H;
		const safeX = Math.max(0, Math.min(width - LOGO_WIDTH, Math.round(x)));
		const safeY = Math.max(0, Math.round(y - yOffset));
		const out = Array.from({ length: height }, () => " ".repeat(width));

		for (let i = 0; i < lines.length; i++) {
			const row = safeY + i;
			if (row < 0 || row >= height) continue;
			const drawn = " ".repeat(safeX) + lines[i]!;
			out[row] = drawn + " ".repeat(Math.max(0, width - visibleWidth(drawn)));
		}
		return out;
	}
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

	await ctx.ui.custom(
		(tui: TUI, theme: Theme, _keybindings: unknown, done: (result: void) => void) =>
			new StartupAnimation(tui, theme, done),
		{
			overlay: true,
			overlayOptions: {
				width: "100%",
				maxHeight: "100%",
				row: 0,
				col: 0,
				nonCapturing: true,
			},
		},
	);
}
