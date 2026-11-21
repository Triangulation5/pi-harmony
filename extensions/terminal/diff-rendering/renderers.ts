import type { BundledLanguage } from "shiki";
import { getDiffRenderingDependencies } from "./types.ts";
import type { DiffColors, DiffLine, ParsedDiff } from "./types.ts";
import { MAX_PREVIEW_LINES, MAX_RENDER_LINES } from "./types.ts";
import { hlBlock, MAX_HL_CHARS } from "./highlight.ts";
import { injectBg, plainWordDiff, wordDiffAnalysis } from "./parse.ts";
import {
	adaptiveWrapRows, collapsedDiffHint, diffLayout, diffRule,
	FORCED_SPLIT_WRAP_ROWS, fit, lnum, maxLineNumber, shouldUseSplit, stripes, summarizeDiff,
	tabs, termW, WORD_DIFF_MIN_SIM, wrapAnsi,
} from "./layout.ts";

const D = getDiffRenderingDependencies;
const P = () => D().getPalette();
export async function renderUnified(
	diff: ParsedDiff,
	language: BundledLanguage | undefined,
	max = MAX_RENDER_LINES,
	dc: DiffColors = P().defaultColors,
	width = termW(),
): Promise<string> {
	if (!diff.lines.length) return "";
	const vis = diff.lines.slice(0, max);
	const tw = width;
	const nw = Math.max(2, String(maxLineNumber(vis)).length);
	const gw = nw + 5;
	const cw = Math.max(20, tw - gw);
	const canHL = diff.chars <= MAX_HL_CHARS && vis.length <= MAX_RENDER_LINES;

	const oldSrc: string[] = [];
	const newSrc: string[] = [];
	for (const line of vis) {
		if (line.type === "ctx" || line.type === "del") oldSrc.push(line.content);
		if (line.type === "ctx" || line.type === "add") newSrc.push(line.content);
	}
	const [oldHL, newHL] = canHL
		? await Promise.all([hlBlock(oldSrc.join("\n"), language), hlBlock(newSrc.join("\n"), language)])
		: [oldSrc, newSrc];

	let oldIndex = 0;
	let newIndex = 0;
	let index = 0;
	const out: string[] = [diffRule(tw)];

	function emitRow(num: number | null, sign: string, gutterBg: string, signFg: string, body: string, bodyBg = ""): void {
		const borderFg = sign === "-" ? dc.fgDel : sign === "+" ? dc.fgAdd : "";
		const border = borderFg ? `${borderFg}▌${P().reset}` : `${P().bgBase} `;
		const numFg = borderFg || P().fgLineNumber;
		const gutter = `${border}${gutterBg}${lnum(num, nw, numFg)}${signFg}${sign} ${P().reset}${P().divider} `;
		const cont = `${border}${gutterBg}${" ".repeat(nw + 2)}${P().reset}${P().divider} `;
		const rows = wrapAnsi(tabs(body), cw, adaptiveWrapRows(), bodyBg);
		out.push(`${gutter}${rows[0]}${P().reset}`);
		for (let r = 1; r < rows.length; r++) out.push(`${cont}${rows[r]}${P().reset}`);
	}

	while (index < vis.length) {
		const line = vis[index];
		if (line.type === "sep") {
			const gap = line.newNum;
			const label = gap && gap > 0 ? ` ${gap} unmodified lines ` : "···";
			const totalW = Math.min(tw, 72);
			const pad = Math.max(0, totalW - label.length - 2);
			const half1 = Math.floor(pad / 2);
			const half2 = pad - half1;
			out.push(`${P().bgBase}${P().fgDim}${"─".repeat(half1)}${label}${"─".repeat(half2)}${P().reset}`);
			index++;
			continue;
		}
		if (line.type === "ctx") {
			const hl = oldHL[oldIndex] ?? line.content;
			emitRow(line.newNum, " ", P().bgBase, dc.fgCtx, `${P().bgBase}${P().dim}${hl}`, P().bgBase);
			oldIndex++;
			newIndex++;
			index++;
			continue;
		}

		const dels: Array<{ l: DiffLine; hl: string }> = [];
		while (index < vis.length && vis[index].type === "del") {
			dels.push({ l: vis[index], hl: oldHL[oldIndex] ?? vis[index].content });
			oldIndex++;
			index++;
		}
		const adds: Array<{ l: DiffLine; hl: string }> = [];
		while (index < vis.length && vis[index].type === "add") {
			adds.push({ l: vis[index], hl: newHL[newIndex] ?? vis[index].content });
			newIndex++;
			index++;
		}

		const isPaired = dels.length === 1 && adds.length === 1;
		const wd = isPaired ? wordDiffAnalysis(dels[0].l.content, adds[0].l.content) : null;
		if (isPaired && wd && wd.similarity >= WORD_DIFF_MIN_SIM && canHL) {
			emitRow(dels[0].l.oldNum, "-", P().bgGutterDel, `${dc.fgDel}${P().bold}`, injectBg(dels[0].hl, wd.oldRanges, P().bgDel, P().bgDelWord), P().bgDel);
			emitRow(adds[0].l.newNum, "+", P().bgGutterAdd, `${dc.fgAdd}${P().bold}`, injectBg(adds[0].hl, wd.newRanges, P().bgAdd, P().bgAddWord), P().bgAdd);
			continue;
		}
		if (isPaired && wd && wd.similarity >= WORD_DIFF_MIN_SIM && !canHL) {
			const pwd = plainWordDiff(dels[0].l.content, adds[0].l.content);
			emitRow(dels[0].l.oldNum, "-", P().bgGutterDel, `${dc.fgDel}${P().bold}`, `${P().bgDel}${pwd.old}`, P().bgDel);
			emitRow(adds[0].l.newNum, "+", P().bgGutterAdd, `${dc.fgAdd}${P().bold}`, `${P().bgAdd}${pwd.new}`, P().bgAdd);
			continue;
		}
		for (const d of dels) emitRow(d.l.oldNum, "-", P().bgGutterDel, `${dc.fgDel}${P().bold}`, `${P().bgDel}${canHL ? d.hl : d.l.content}`, P().bgDel);
		for (const a of adds) emitRow(a.l.newNum, "+", P().bgGutterAdd, `${dc.fgAdd}${P().bold}`, `${P().bgAdd}${canHL ? a.hl : a.l.content}`, P().bgAdd);
	}

	out.push(diffRule(tw));
	if (diff.lines.length > vis.length) out.push(`${P().bgBase}${P().fgDim}  ${collapsedDiffHint(diff.lines.length - vis.length, 0)}${P().reset}`);
	return out.join("\n");
}

export async function renderSplit(
	diff: ParsedDiff,
	language: BundledLanguage | undefined,
	max = MAX_PREVIEW_LINES,
	dc: DiffColors = P().defaultColors,
	width = termW(),
): Promise<string> {
	const tw = width;
	if (!shouldUseSplit(diff, tw, max)) return renderUnified(diff, language, max, dc, width);
	if (!diff.lines.length) return "";

	type Row = { left: DiffLine | null; right: DiffLine | null };
	const rows: Row[] = [];
	let i = 0;
	while (i < diff.lines.length) {
		const line = diff.lines[i];
		if (line.type === "sep" || line.type === "ctx") {
			rows.push({ left: line, right: line });
			i++;
			continue;
		}
		const dels: DiffLine[] = [];
		const adds: DiffLine[] = [];
		while (i < diff.lines.length && diff.lines[i].type === "del") dels.push(diff.lines[i++]);
		while (i < diff.lines.length && diff.lines[i].type === "add") adds.push(diff.lines[i++]);
		const n = Math.max(dels.length, adds.length);
		for (let j = 0; j < n; j++) rows.push({ left: dels[j] ?? null, right: adds[j] ?? null });
	}

	const vis = rows.slice(0, max);
	const half = Math.floor((tw - 1) / 2);
	const nw = Math.max(2, String(maxLineNumber(diff.lines)).length);
	const gw = nw + 5;
	const cw = Math.max(12, half - gw);
	// Auto only picks split when lines fit, so the usual wrap cap rarely bites. A forced
	// split ("diffLayout": "split") halves the code width for every diff, and that cap
	// (one row below 120 columns) cut long lines off instead of wrapping them. Wrap
	// forced-split lines in full, with a cap only against minified one-liners.
	const splitWrapRows = diffLayout() === "split"
		? Math.max(adaptiveWrapRows(), FORCED_SPLIT_WRAP_ROWS)
		: adaptiveWrapRows();
	const canHL = diff.chars <= MAX_HL_CHARS && vis.length * 2 <= MAX_RENDER_LINES * 2;

	const leftSrc: string[] = [];
	const rightSrc: string[] = [];
	for (const row of vis) {
		if (row.left && row.left.type !== "sep") leftSrc.push(row.left.content);
		if (row.right && row.right.type !== "sep") rightSrc.push(row.right.content);
	}
	const [leftHL, rightHL] = canHL
		? await Promise.all([hlBlock(leftSrc.join("\n"), language), hlBlock(rightSrc.join("\n"), language)])
		: [leftSrc, rightSrc];

	let leftIndex = 0;
	let rightIndex = 0;

	type HalfResult = { gutter: string; contGutter: string; bodyRows: string[] };
	function halfBuild(
		line: DiffLine | null,
		hl: string,
		ranges: Array<[number, number]> | null,
		side: "left" | "right",
	): HalfResult {
		if (!line) {
			const gPat = P().fgStripe + "╱".repeat(nw + 2) + P().reset;
			const gutter = ` ${gPat}${P().fgRule}│${P().reset} `;
			return { gutter, contGutter: gutter, bodyRows: [stripes(cw)] };
		}
		if (line.type === "sep") {
			const gap = line.newNum;
			const label = gap && gap > 0 ? `··· ${gap} lines ···` : "···";
			const gutter = `${P().bgBase} ${P().fgDim}${fit("", nw + 2)}${P().reset}${P().fgRule}│${P().reset} `;
			return { gutter, contGutter: gutter, bodyRows: [`${P().bgBase}${P().fgDim}${fit(label, cw)}${P().reset}`] };
		}
		const isDel = line.type === "del";
		const isAdd = line.type === "add";
		const gBg = isDel ? P().bgGutterDel : isAdd ? P().bgGutterAdd : P().bgBase;
		const cBg = isDel ? P().bgDel : isAdd ? P().bgAdd : P().bgBase;
		const sFg = isDel ? dc.fgDel : isAdd ? dc.fgAdd : dc.fgCtx;
		const sign = isDel ? "-" : isAdd ? "+" : " ";
		const num = isDel ? line.oldNum : isAdd ? line.newNum : side === "left" ? line.oldNum : line.newNum;
		const borderFg = isDel ? dc.fgDel : isAdd ? dc.fgAdd : "";
		const border = borderFg ? `${borderFg}▌${P().reset}` : ` ${P().bgBase}`;
		const numFg = borderFg || P().fgLineNumber;
		let body: string;
		if (ranges && ranges.length > 0) body = injectBg(hl, ranges, cBg, isDel ? P().bgDelWord : P().bgAddWord);
		else if (isDel || isAdd) body = `${cBg}${hl}`;
		else body = `${P().bgBase}${P().dim}${hl}`;
		const gutter = `${border}${gBg}${lnum(num, nw, numFg)}${sFg}${P().bold}${sign} ${P().reset}${P().fgRule}│${P().reset} `;
		const contGutter = `${border}${gBg}${" ".repeat(nw + 2)}${P().reset}${P().fgRule}│${P().reset} `;
		return { gutter, contGutter, bodyRows: wrapAnsi(tabs(body), cw, splitWrapRows, cBg) };
	}

	const out: string[] = [];
	const hdrOld = `${P().bgBase}${" ".repeat(Math.max(0, nw - 2))}${dc.fgDel}${P().dim}old${P().reset}`;
	const hdrNew = `${P().bgBase}${" ".repeat(Math.max(0, nw - 2))}${dc.fgAdd}${P().dim}new${P().reset}`;
	out.push(`${P().bgBase}${hdrOld}${" ".repeat(Math.max(0, half - nw - 1))}${P().fgRule}┊${P().reset}${hdrNew}`);
	out.push(`${diffRule(half)}${P().fgRule}┊${P().reset}${diffRule(half)}`);

	for (const row of vis) {
		const leftLine = row.left;
		const rightLine = row.right;
		const paired = Boolean(leftLine && rightLine && leftLine.type === "del" && rightLine.type === "add");
		const wd = paired && leftLine && rightLine ? wordDiffAnalysis(leftLine.content, rightLine.content) : null;
		let leftResult: HalfResult;
		let rightResult: HalfResult;
		if (paired && wd && leftLine && rightLine && wd.similarity >= WORD_DIFF_MIN_SIM && canHL) {
			leftResult = halfBuild(leftLine, leftHL[leftIndex++] ?? leftLine.content, wd.oldRanges, "left");
			rightResult = halfBuild(rightLine, rightHL[rightIndex++] ?? rightLine.content, wd.newRanges, "right");
		} else if (paired && wd && leftLine && rightLine && wd.similarity >= WORD_DIFF_MIN_SIM && !canHL) {
			const pwd = plainWordDiff(leftLine.content, rightLine.content);
			leftIndex++;
			rightIndex++;
			leftResult = halfBuild(leftLine, pwd.old, null, "left");
			rightResult = halfBuild(rightLine, pwd.new, null, "right");
		} else {
			leftResult = halfBuild(
				row.left,
				row.left && row.left.type !== "sep" ? (leftHL[leftIndex++] ?? row.left.content) : "",
				null,
				"left",
			);
			rightResult = halfBuild(
				row.right,
				row.right && row.right.type !== "sep" ? (rightHL[rightIndex++] ?? row.right.content) : "",
				null,
				"right",
			);
		}
		const maxRows = Math.max(leftResult.bodyRows.length, rightResult.bodyRows.length);
		for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
			const lg = rowIndex === 0 ? leftResult.gutter : leftResult.contGutter;
			const rg = rowIndex === 0 ? rightResult.gutter : rightResult.contGutter;
			const lb = leftResult.bodyRows[rowIndex] ?? (!row.left ? stripes(cw) : `${P().bgEmpty}${" ".repeat(cw)}${P().reset}`);
			const rb = rightResult.bodyRows[rowIndex] ?? (!row.right ? stripes(cw) : `${P().bgEmpty}${" ".repeat(cw)}${P().reset}`);
			out.push(`${lg}${lb}${P().divider}${rg}${rb}`);
		}
	}

	out.push(`${diffRule(half)}${P().fgRule}┊${P().reset}${diffRule(half)}`);
	if (rows.length > vis.length) out.push(`${P().bgBase}${P().fgDim}  ${collapsedDiffHint(rows.length - vis.length, 0)}${P().reset}`);
	return out.join("\n");
}

