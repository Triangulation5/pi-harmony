import type { Theme } from "@earendil-works/pi-coding-agent";
import type { BundledLanguage } from "shiki";
import type { ParsedDiff } from "../diff-rendering/types.ts";

export interface SavedEditPreview {
	oldLine: number;
	newLine: number;
	oldText?: string;
}

export interface LocalizedEditDiff {
	diff: ParsedDiff;
	line: number;
	saved?: SavedEditPreview;
}

export interface EditPreviewDependencies {
	readFile(path: string, encoding: "utf8"): Promise<string>;
	resolvePath(cwd: string, path: string): string;
	getDiff(): typeof import("diff");
	parseDiff(before: string, after: string): ParsedDiff;
	summarizeDiff(added: number, removed: number): string;
	MAX_PREVIEW_LINES: number;
	MAX_RENDER_LINES: number;
	DIFF_RENDER_CONCURRENCY: number;
	contextDiffWidth(ctx: any): number;
	resolveDiffColors(theme: Theme): any;
	renderSplit(diff: ParsedDiff, language: BundledLanguage | undefined, lines: number, colors: any, width: number): Promise<string>;
	mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
	formatLineMeta(line: number, theme: Theme): string;
	withBranch(text: string, theme: Theme, ...args: any[]): string;
	toolOutputDetailHint(theme: Theme, expanded: boolean, hasMore?: boolean): string;
	safeInvalidate(ctx: any): void;
}

export interface EditPreview {
	normalizeToLf(text: string): string;
	restoreLocalizedEditDiffs(saved: unknown, operations: Array<{ oldText: string; newText: string }>): LocalizedEditDiff[] | null;
	oldContentFromPatch(patch: string, operations: Array<{ oldText: string; newText: string }>): string;
	computeLocalizedEditDiffs(filePath: string, operations: Array<{ oldText: string; newText: string }>, cwd: string, savedPatch?: string): Promise<LocalizedEditDiff[] | null>;
	renderEditPreviewBody(ctx: any, key: string, theme: Theme, language: BundledLanguage | undefined, operations: Array<{ oldText: string; newText: string }>, diffs: ParsedDiff[], lines: number[], summary: string): void;
	getFirstChangedNewLine(diff: ParsedDiff): number;
}

export function createEditPreview(deps: EditPreviewDependencies): EditPreview {
	const normalizeToLf = (text: string): string => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const stripBomText = (text: string): string => text.startsWith("\uFEFF") ? text.slice(1) : text;

	const normalizeTextForFuzzyMatch = (text: string): string => text
		.normalize("NFKC")
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n")
		.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
		.replace(/[\u201C\u201D\u201E\u201F]/g, '"')
		.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
		.replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");

	const findEditMatch = (content: string, oldText: string): { found: boolean; index: number; matchLength: number; usedFuzzyMatch: boolean } => {
		const exactIndex = content.indexOf(oldText);
		if (exactIndex !== -1) return { found: true, index: exactIndex, matchLength: oldText.length, usedFuzzyMatch: false };
		const fuzzyContent = normalizeTextForFuzzyMatch(content);
		const fuzzyOldText = normalizeTextForFuzzyMatch(oldText);
		const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText);
		return fuzzyIndex === -1
			? { found: false, index: -1, matchLength: 0, usedFuzzyMatch: false }
			: { found: true, index: fuzzyIndex, matchLength: fuzzyOldText.length, usedFuzzyMatch: true };
	};

	const countFuzzyOccurrences = (content: string, oldText: string): number =>
		normalizeTextForFuzzyMatch(content).split(normalizeTextForFuzzyMatch(oldText)).length - 1;
	const lineNumberAtIndex = (text: string, index: number): number => text.slice(0, Math.max(0, index)).split("\n").length;
	const countLineBreaks = (text: string): number => (text.match(/\n/g) ?? []).length;
	const offsetParsedDiff = (diff: ParsedDiff, oldOffset: number, newOffset = oldOffset): ParsedDiff => ({
		...diff,
		lines: diff.lines.map((line) => line.type === "sep" ? line : {
			...line,
			oldNum: line.oldNum === null ? null : line.oldNum + oldOffset,
			newNum: line.newNum === null ? null : line.newNum + newOffset,
		}),
	});

	const getFirstChangedNewLine = (diff: ParsedDiff): number => {
		let currentNewLine = 0;
		for (let i = 0; i < diff.lines.length; i++) {
			const line = diff.lines[i];
			if (line.type === "sep") { currentNewLine = 0; continue; }
			if (line.type === "ctx") { currentNewLine = (line.newNum ?? currentNewLine) + 1; continue; }
			if (line.type === "add") return line.newNum ?? currentNewLine;
			if (currentNewLine > 0) return currentNewLine;
			const next = diff.lines.slice(i + 1).find((entry) => entry.type !== "sep" && entry.newNum !== null);
			if (next && next.newNum !== null) return next.newNum;
			return line.oldNum ?? 0;
		}
		return 0;
	};

	const restoreLocalizedEditDiffs = (saved: unknown, operations: Array<{ oldText: string; newText: string }>): LocalizedEditDiff[] | null => {
		if (!Array.isArray(saved) || saved.length !== operations.length) return null;
		return operations.map((edit, i) => {
			const { oldLine, newLine, oldText } = saved[i] as SavedEditPreview;
			const diff = offsetParsedDiff(deps.parseDiff(oldText ?? normalizeToLf(edit.oldText), normalizeToLf(edit.newText)), oldLine - 1, newLine - 1);
			return { diff, line: getFirstChangedNewLine(diff) };
		});
	};

	const oldContentFromPatch = (patch: string, operations: Array<{ oldText: string; newText: string }>): string => {
		const known: string[] = [];
		const changes: number[] = [];
		for (const hunk of deps.getDiff().parsePatch(patch)[0]?.hunks ?? []) {
			let at = hunk.oldStart - 1;
			for (const line of hunk.lines) {
				if (line[0] === "-" || line[0] === "+") changes.push(at);
				if (line[0] === " " || line[0] === "-") known[at++] = line.slice(1);
			}
		}
		const fuzzy = known.map(normalizeTextForFuzzyMatch);
		for (const { oldText } of operations) {
			const own = normalizeToLf(oldText).split("\n");
			const want = normalizeTextForFuzzyMatch(normalizeToLf(oldText)).split("\n");
			const last = want.length - 1;
			const starts = new Set<number>();
			for (const change of changes) {
				for (let at = Math.max(0, change - want.length); at <= change; at++) starts.add(at);
			}
			const fits = [...starts].filter((at) => {
				let overlaps = false;
				return want.every((line, i) => {
					const have = fuzzy[at + i];
					if (have === undefined) return true;
					overlaps = true;
					return i === 0 ? have.endsWith(line) : i === last ? have.startsWith(line) : have === line;
				}) && overlaps;
			});
			if (fits.length === 1) own.forEach((line, i) => { if (line || (i > 0 && i < last)) known[fits[0] + i] ??= line; });
		}
		return `${Array.from(known, (line) => line ?? "\u0000").join("\n")}\n`;
	};

	const computeLocalizedEditDiffs = async (filePath: string, operations: Array<{ oldText: string; newText: string }>, cwd: string, savedPatch?: string): Promise<LocalizedEditDiff[] | null> => {
		if (!filePath || operations.length === 0) return null;
		try {
			const rawContent = savedPatch === undefined ? await deps.readFile(deps.resolvePath(cwd, filePath), "utf8") : oldContentFromPatch(savedPatch, operations);
			const normalizedContent = normalizeToLf(stripBomText(rawContent));
			const normalizedOps = operations.map((edit) => ({ oldText: normalizeToLf(edit.oldText), newText: normalizeToLf(edit.newText) }));
			const baseContent = normalizedOps.some((edit) => findEditMatch(normalizedContent, edit.oldText).usedFuzzyMatch)
				? normalizeTextForFuzzyMatch(normalizedContent)
				: normalizedContent;
			const matches = normalizedOps.map((edit, editIndex) => {
				const match = findEditMatch(baseContent, edit.oldText);
				if (!match.found || countFuzzyOccurrences(baseContent, edit.oldText) !== 1) return null;
				return { editIndex, matchIndex: match.index, matchLength: match.matchLength, newText: edit.newText };
			});
			if (matches.some((match) => match === null)) return null;
			const ordered = [...(matches as Array<{ editIndex: number; matchIndex: number; matchLength: number; newText: string }>)].sort((a, b) => a.matchIndex - b.matchIndex);
			for (let i = 1; i < ordered.length; i++) {
				const prev = ordered[i - 1], current = ordered[i];
				if (prev.matchIndex + prev.matchLength > current.matchIndex) return null;
			}
			const localized: Array<LocalizedEditDiff | null> = Array(operations.length).fill(null);
			let lineDelta = 0;
			for (const match of ordered) {
				const oldChunk = baseContent.slice(match.matchIndex, match.matchIndex + match.matchLength);
				const oldStartLine = lineNumberAtIndex(baseContent, match.matchIndex);
				const newStartLine = oldStartLine + lineDelta;
				const diff = offsetParsedDiff(deps.parseDiff(oldChunk, match.newText), oldStartLine - 1, newStartLine - 1);
				const saved: SavedEditPreview = { oldLine: oldStartLine, newLine: newStartLine };
				if (oldChunk !== normalizedOps[match.editIndex].oldText) saved.oldText = oldChunk;
				localized[match.editIndex] = { diff, line: getFirstChangedNewLine(diff), saved };
				lineDelta += countLineBreaks(match.newText) - countLineBreaks(oldChunk);
			}
			return localized.every(Boolean) ? (localized as LocalizedEditDiff[]) : null;
		} catch {
			return null;
		}
	};

	const renderEditPreviewBody = (ctx: any, key: string, theme: Theme, language: BundledLanguage | undefined, operations: Array<{ oldText: string; newText: string }>, diffs: ParsedDiff[], lines: number[], summary: string): void => {
		const dc = deps.resolveDiffColors(theme);
		const branchWidth = deps.contextDiffWidth(ctx);
		if (operations.length === 1) {
			const [diff] = diffs;
			const line = lines[0] ?? getFirstChangedNewLine(diff);
			deps.renderSplit(diff, language, ctx.expanded ? deps.MAX_PREVIEW_LINES : 32, dc, branchWidth).then((rendered) => {
				if (ctx.state._pk !== key) return;
				ctx.state._ptBody = `${deps.summarizeDiff(diff.added, diff.removed)}${deps.formatLineMeta(line, theme)}\n${rendered}`;
				ctx.state._ptDisplay = deps.withBranch(ctx.state._ptBody, theme, false, true);
				deps.safeInvalidate(ctx);
			}).catch(() => {
				if (ctx.state._pk !== key) return;
				ctx.state._ptBody = `${deps.summarizeDiff(diff.added, diff.removed)}${deps.formatLineMeta(line, theme)}`;
				ctx.state._ptDisplay = deps.withBranch(ctx.state._ptBody, theme, false, true);
				deps.safeInvalidate(ctx);
			});
			return;
		}
		const maxShown = ctx.expanded ? operations.length : Math.min(operations.length, 3);
		const previewLines = ctx.expanded
			? Math.max(6, Math.floor(deps.MAX_RENDER_LINES / Math.max(1, maxShown)))
			: Math.max(8, Math.floor(deps.MAX_PREVIEW_LINES / Math.max(1, maxShown)));
		deps.mapWithConcurrency(diffs.slice(0, maxShown), deps.DIFF_RENDER_CONCURRENCY, async (diff, index) => {
			const line = lines[index] ?? getFirstChangedNewLine(diff);
			return deps.renderSplit(diff, language, previewLines, dc, branchWidth).then((rendered) =>
				`Edit ${index + 1}/${operations.length}${deps.formatLineMeta(line, theme)}\n${rendered}`
			).catch(() => `Edit ${index + 1}/${operations.length}${deps.formatLineMeta(line, theme)} ${deps.summarizeDiff(diff.added, diff.removed)}`);
		}).then((sections) => {
			if (ctx.state._pk !== key) return;
			const remainder = operations.length - maxShown;
			const suffix = remainder > 0 ? `\n${theme.fg("muted", `... ${remainder} more edit blocks${deps.toolOutputDetailHint(theme, ctx.expanded, true)}`)}` : "";
			ctx.state._ptBody = `${operations.length} edits ${summary}\n\n${sections.join("\n\n")}${suffix}`;
			ctx.state._ptDisplay = deps.withBranch(ctx.state._ptBody, theme, false, true);
			deps.safeInvalidate(ctx);
		}).catch(() => {
			if (ctx.state._pk !== key) return;
			ctx.state._ptBody = `${operations.length} edits ${summary}`;
			ctx.state._ptDisplay = deps.withBranch(ctx.state._ptBody, theme, false, true);
			deps.safeInvalidate(ctx);
		});
	};

	return { normalizeToLf, restoreLocalizedEditDiffs, oldContentFromPatch, computeLocalizedEditDiffs, renderEditPreviewBody, getFirstChangedNewLine };
}
