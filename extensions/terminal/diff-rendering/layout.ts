import { getDiffRenderingDependencies } from "./types.ts";

const D = getDiffRenderingDependencies;
const P = () => D().getPalette();
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const MAX_TERM_WIDTH = 210;
const DEFAULT_TERM_WIDTH = 200;
const SPLIT_MIN_WIDTH = 150;
const SPLIT_MIN_CODE_WIDTH = 60;
const SPLIT_MAX_WRAP_RATIO = 0.2;
const SPLIT_MAX_WRAP_LINES = 8;
const MAX_WRAP_ROWS_WIDE = 3;
const MAX_WRAP_ROWS_MED = 2;
const MAX_WRAP_ROWS_NARROW = 1;
export const FORCED_SPLIT_WRAP_ROWS = 8;
export const WORD_DIFF_MIN_SIM = 0.15;
import type { DiffLine, ParsedDiff } from "./types.ts";
import { MAX_PREVIEW_LINES } from "./types.ts";

export function diffStrip(value: string): string {
	return value.replace(ANSI_RE, "");
}

export function tabs(text: string): string {
	return text.replace(/\t/g, "  ");
}

export function termW(): number {
	const raw =
		process.stdout.columns ||
		(process.stderr as any).columns ||
		Number.parseInt(process.env.COLUMNS ?? "", 10) ||
		DEFAULT_TERM_WIDTH;
	return Math.max(40, Math.min(raw - 4, MAX_TERM_WIDTH));
}

export function branchDiffWidth(componentWidth?: number, chromeWidth = 2 + D().getBranchIndent().length): number {
	const width = typeof componentWidth === "number" && Number.isFinite(componentWidth)
		? Math.floor(componentWidth)
		: termW();
	return Math.max(20, Math.min(width - chromeWidth, MAX_TERM_WIDTH));
}

// Diff preview cache keys also carry _toolBranchVisualEpoch, which applyThemePaletteIfNeeded
// bumps when the theme palette changes: otherwise rows rendered before a /theme or light/dark
// switch kept the old diff backgrounds and stat colors while new rows used the new ones.
export function contextDiffWidth(ctx: any, chromeWidth = 2 + D().getBranchIndent().length): number {
	return branchDiffWidth(ctx.state?._diffComponentWidth, chromeWidth);
}

// Diff previews are laid out for the row's real width, which is only known after the
// row's text component has rendered once. Starting the async Shiki render before that
// used the termW() guess and rendered every diff a second time once the real width
// arrived (on resume: every edit/write row, twice). Wait for the width instead; the
// width observer invalidates the row as soon as it is known.
export function adaptiveWrapRows(tw?: number): number {
	const width = tw ?? termW();
	if (width >= 180) return MAX_WRAP_ROWS_WIDE;
	if (width >= 120) return MAX_WRAP_ROWS_MED;
	return MAX_WRAP_ROWS_NARROW;
}

const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const ASCII_PLAIN_RE = /^[\x20-\x7e]*$/;
const CELL_WIDTH_CACHE = new Map<string, number>();

/** Terminal columns for one grapheme cluster; CJK and emoji occupy two. */
function graphemeWidth(grapheme: string): number {
	if (grapheme.length === 1) {
		const code = grapheme.charCodeAt(0);
		if (code >= 0x20 && code <= 0x7e) return 1;
	}
	const cached = CELL_WIDTH_CACHE.get(grapheme);
	if (cached !== undefined) return cached;
	const measured = D().visibleWidth(grapheme);
	if (CELL_WIDTH_CACHE.size < 4096) CELL_WIDTH_CACHE.set(grapheme, measured);
	return measured;
}

interface AnsiCell {
	text: string;
	width: number;
}

/**
 * Split ANSI-styled text into terminal cells: SGR sequences carry zero width, every
 * grapheme cluster keeps its real column width. Diff gutters, padding and stripes are
 * laid out in cells, so measuring `text.length` (UTF-16 units) overflowed every CJK line
 * into the next column.
 */
function toCells(text: string): AnsiCell[] {
	const cells: AnsiCell[] = [];
	const pushPlain = (plain: string): void => {
		if (!plain) return;
		if (ASCII_PLAIN_RE.test(plain)) {
			for (let i = 0; i < plain.length; i++) cells.push({ text: plain[i], width: 1 });
			return;
		}
		for (const { segment } of GRAPHEME_SEGMENTER.segment(plain)) {
			cells.push({ text: segment, width: graphemeWidth(segment) });
		}
	};
	let last = 0;
	for (const match of text.matchAll(ANSI_RE)) {
		const start = match.index ?? 0;
		pushPlain(text.slice(last, start));
		cells.push({ text: match[0], width: 0 });
		last = start + match[0].length;
	}
	pushPlain(text.slice(last));
	return cells;
}

export function fit(value: string, width: number): string {
	if (width <= 0) return "";
	const plainWidth = D().visibleWidth(diffStrip(value));
	if (plainWidth <= width) return value + " ".repeat(width - plainWidth);
	const showWidth = width > 2 ? width - 1 : width;
	let out = "";
	let vis = 0;
	for (const cell of toCells(value)) {
		if (vis + cell.width > showWidth) break;
		out += cell.text;
		vis += cell.width;
	}
	// A trailing double-width grapheme can stop the loop one cell short.
	const pad = " ".repeat(Math.max(0, showWidth - vis));
	return width > 2 ? `${out}${pad}${P().reset}${P().fgDim}›${P().reset}` : `${out}${pad}${P().reset}`;
}

function ansiState(text: string): string {
	const matches = text.match(/\x1b\[[0-9;]*m/g) ?? [];
	let fg = "";
	let bg = "";
	for (const seq of matches) {
		const params = seq.slice(2, -1);
		if (params === "0") {
			fg = "";
			bg = "";
		} else if (params === "39") {
			fg = "";
		} else if (params.startsWith("38;")) {
			fg = seq;
		} else if (params.startsWith("48;")) {
			bg = seq;
		}
	}
	return bg + fg;
}

export function wrapAnsi(text: string, width: number, maxRows = adaptiveWrapRows(), fillBg = ""): string[] {
	if (width <= 0) return [""];
	const plainWidth = D().visibleWidth(diffStrip(text));
	if (plainWidth <= width) {
		const pad = width - plainWidth;
		return pad > 0 ? [text + fillBg + " ".repeat(pad) + (fillBg ? P().reset : "")] : [text];
	}
	const cells = toCells(text);

	const rows: string[] = [];
	let row = "";
	let vis = 0;
	let i = 0;
	let onLastRow = false;
	let effectiveWidth = width;

	while (i < cells.length) {
		if (!onLastRow && rows.length >= maxRows - 1) {
			onLastRow = true;
			effectiveWidth = width > 2 ? width - 1 : width;
		}
		const cell = cells[i];
		if (vis > 0 && vis + cell.width > effectiveWidth) {
			if (onLastRow) {
				let hasMore = false;
				for (let j = i; j < cells.length; j++) {
					if (cells[j].width > 0) {
						hasMore = true;
						break;
					}
				}
				if (hasMore && width > 2) row += `${P().reset}${P().fgDim}›${P().reset}`;
				else row += fillBg + " ".repeat(Math.max(0, width - vis)) + P().reset;
				rows.push(row);
				return rows;
			}
			const state = ansiState(row);
			// A double-width grapheme that does not fit leaves a cell empty; pad it so the
			// next column's gutter stays aligned.
			rows.push(vis < width ? `${row}${fillBg}${" ".repeat(width - vis)}${P().reset}` : `${row}${P().reset}`);
			row = state + fillBg;
			vis = 0;
			if (rows.length >= maxRows - 1) {
				onLastRow = true;
				effectiveWidth = width > 2 ? width - 1 : width;
			}
		}
		row += cell.text;
		vis += cell.width;
		i++;
	}

	if (row.length > 0 || rows.length === 0) {
		rows.push(row + fillBg + " ".repeat(Math.max(0, width - vis)) + P().reset);
	}
	return rows;
}

export function lnum(n: number | null, width: number, fg = P().fgLineNumber): string {
	if (n === null) return " ".repeat(width);
	const value = String(n);
	// Callers reset after the whole gutter cell so wrapped rows keep one
	// continuous add/remove background through the line-number/sign columns.
	return `${fg}${" ".repeat(Math.max(0, width - value.length))}${value}`;
}

export function stripes(width: number): string {
	return P().bgBase + P().fgStripe + "╱".repeat(width) + P().reset;
}

export function summarizeDiff(added: number, removed: number): string {
	const parts: string[] = [];
	if (added > 0) parts.push(`${P().fgAdd}+${added}${P().reset}`);
	if (removed > 0) parts.push(`${P().fgDel}-${removed}${P().reset}`);
	if (!parts.length) return `${P().fgDim}no changes${P().reset}`;
	return parts.join(" ");
}

export function diffSummaryWithMeta(added: number, removed: number, hunks: number, mode: string): string {
	const base = summarizeDiff(added, removed);
	const extras: string[] = [];
	if (hunks > 0) extras.push(`${P().fgDim}${hunks} hunk${hunks === 1 ? "" : "s"}${P().reset}`);
	if (mode) extras.push(`${P().fgDim}${mode}${P().reset}`);
	return extras.length ? `${base} ${P().fgDim}•${P().reset} ${extras.join(` ${P().fgDim}•${P().reset} `)}` : base;
}

export function collapsedDiffHint(remainingLines: number, hiddenHunks: number): string {
	const width = termW();
	const candidates = [
		`... (${remainingLines} more diff lines${hiddenHunks > 0 ? ` • ${hiddenHunks} more hunks` : ""} • ${D().keyHint("app.tools.expand", "to toggle")})`,
		`... (${remainingLines} more lines${hiddenHunks > 0 ? ` • ${hiddenHunks} hunks` : ""})`,
		`... (+${remainingLines}${hiddenHunks > 0 ? ` • +${hiddenHunks}h` : ""})`,
		"...",
	];
	for (const candidate of candidates) {
		if (D().visibleWidth(candidate) <= width) return candidate;
	}
	return D().truncateToWidth("...", width, "");
}

export function diffRule(width: number): string {
	return `${P().bgBase}${P().fgRule}${"─".repeat(width)}${P().reset}`;
}

/** Max line number across diff lines. Loop-based (not Math.max(...spread)) so huge
 *  diffs don't blow the call stack with a RangeError. Returns identical results. */
export function maxLineNumber(lines: DiffLine[]): number {
	let max = 0;
	for (let i = 0; i < lines.length; i++) {
		const n = lines[i].oldNum ?? lines[i].newNum ?? 0;
		if (n > max) max = n;
	}
	return max;
}

export function diffLayout(): "auto" | "split" | "unified" {
	const value = D().getSettings().diffLayout;
	return value === "split" || value === "unified" ? value : "auto";
}

export function shouldUseSplit(diff: ParsedDiff, tw: number, maxRows = MAX_PREVIEW_LINES): boolean {
	if (!diff.lines.length) return false;
	const layout = diffLayout();
	if (layout === "unified") return false;
	const nw = Math.max(2, String(maxLineNumber(diff.lines)).length);
	const half = Math.floor((tw - 1) / 2);
	const gw = nw + 5;
	// Forced split still needs room for both code columns; below that it would overflow the row.
	if (layout === "split") return half - gw >= 12;
	if (tw < SPLIT_MIN_WIDTH) return false;
	const cw = Math.max(12, half - gw);
	if (cw < SPLIT_MIN_CODE_WIDTH) return false;
	const vis = diff.lines.slice(0, maxRows);
	let contentLines = 0;
	let wrapCandidates = 0;
	for (const line of vis) {
		if (line.type === "sep") continue;
		contentLines++;
		if (D().visibleWidth(tabs(line.content)) > cw) wrapCandidates++;
	}
	if (contentLines === 0) return true;
	const wrapRatio = wrapCandidates / contentLines;
	if (wrapCandidates >= SPLIT_MAX_WRAP_LINES) return false;
	if (wrapRatio >= SPLIT_MAX_WRAP_RATIO) return false;
	return true;
}

