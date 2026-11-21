import { Markdown, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { MarkdownOptions, MarkdownThemeLike, ParagraphSegment } from "../../markdown/math.ts";
import { buildParagraphSegments, renderMathBlock } from "../../markdown/math.ts";

export interface ParagraphDependencies {
	copySafeMarkdownTheme: (theme: MarkdownThemeLike) => MarkdownThemeLike;
	stripTransientMagicContextTags: (text: string) => string;
	sanitizeRenderedTextBlockLines: (lines: string[]) => string[];
	isCodeBoxChromeLine: (line: string) => boolean;
	normalizeLeadingCheckGlyph: (line: string) => string;
	copySkip: (text: string) => string;
	clampLineWidth: (line: string, width: number) => string;
	stripAnsi: (text: string) => string;
	stripThinkingPresentationArtifacts: (text: string) => string;
	thinkingLabelEnabled: () => boolean;
	workedLineFg: () => string;
	branchVisualEpoch: () => number;
	brightenRenderedLine: (line: string) => string;
}

export function createMessageParagraphClasses(deps: ParagraphDependencies) {
	class DottedParagraph {
		private segments: ParagraphSegment[];
		private markdownTheme: MarkdownThemeLike;
		private cachedWidth?: number;
		private cachedLines?: string[];

		constructor(text: string, markdownTheme: MarkdownThemeLike, options?: MarkdownOptions) {
			this.markdownTheme = deps.copySafeMarkdownTheme(markdownTheme);
			this.segments = buildParagraphSegments(deps.stripTransientMagicContextTags(text), this.markdownTheme, options);
		}
		invalidate(): void {
			this.cachedWidth = undefined;
			this.cachedLines = undefined;
			for (const segment of this.segments) if (segment.kind === "markdown") segment.md.invalidate();
		}
		render(width: number): string[] {
			if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
			const safeWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
			if (safeWidth <= 0) { this.cachedWidth = width; this.cachedLines = [""]; return this.cachedLines; }
			const PREFIX_W = 3;
			if (safeWidth <= PREFIX_W) {
				this.cachedWidth = width;
				this.cachedLines = [deps.clampLineWidth(" ● ", safeWidth)];
				return this.cachedLines;
			}
			const contentWidth = safeWidth - PREFIX_W;
			const lines = this.segments.flatMap((segment) => segment.kind === "math"
				? renderMathBlock(segment.raw, contentWidth, this.markdownTheme)
				: deps.sanitizeRenderedTextBlockLines(segment.md.render(contentWidth)));
			const looksLikeTaskStatus = lines.some((line) => /\b(?:transcript:|No output\.|Wrapped up)/.test(deps.stripAnsi(line)));
			const displayLines = looksLikeTaskStatus ? lines.map(deps.normalizeLeadingCheckGlyph) : lines;
			let dotPlaced = false;
			const gutter = deps.copySkip("   ");
			const rendered = displayLines.map((line: string) => {
				if (!deps.stripAnsi(line).trim()) return `${gutter}${line}`;
				if (deps.isCodeBoxChromeLine(line)) return `${gutter}${line}`;
				if (!dotPlaced) { dotPlaced = true; return `${deps.copySkip(" ● ")}${line}`; }
				return `${gutter}${line}`;
			}).map((line) => {
				const gap = safeWidth - visibleWidth(line);
				return gap > 0 ? line + " ".repeat(gap) : gap < 0 ? truncateToWidth(line, safeWidth, "", false) : line;
			});
			this.cachedWidth = width;
			this.cachedLines = rendered;
			return rendered;
		}
	}

	class ThinkingParagraph {
		private text: string;
		private hovered = false;
		private cachedWidth?: number;
		private cachedLines?: string[];
		private cachedHovered = false;
		private chromeEpoch = -1;
		private options?: MarkdownOptions;

		constructor(text: string, _markdownTheme: ConstructorParameters<typeof Markdown>[3],
			_defaultTextStyle?: ConstructorParameters<typeof Markdown>[4], options?: MarkdownOptions) {
			this.text = deps.stripThinkingPresentationArtifacts(deps.stripTransientMagicContextTags(text)).trim();
			this.options = options;
		}
		setHovered(hovered: boolean): void {
			if (this.hovered === hovered) return;
			this.hovered = hovered;
			this.invalidate();
		}
		private thinkingMarkdown(): InstanceType<typeof Markdown> {
			const DIM_FG = deps.workedLineFg();
			const wrap = (s: string) => `${DIM_FG}${s}`;
			const wrapPlain = (s: string) => wrap(deps.stripAnsi(s));
			const plainTheme: ConstructorParameters<typeof Markdown>[3] = {
				heading: wrap, link: wrapPlain, linkUrl: wrapPlain, code: wrap, codeBlock: wrap,
				codeBlockBorder: wrap, quote: wrap, quoteBorder: wrap, hr: wrap,
				listBullet: (marker: string) => wrap(marker), bold: wrap, italic: wrap, strikethrough: wrap, underline: wrap,
				highlightCode: (code: string) => code.split("\n").map((line) => `${DIM_FG}${line}`),
			};
			const plainStyle: ConstructorParameters<typeof Markdown>[4] = { italic: false, color: (s: string) => `${DIM_FG}${s}` };
			return new Markdown(this.text, 0, 0, plainTheme, plainStyle, this.options);
		}
		invalidate(): void {
			this.cachedWidth = undefined;
			this.cachedLines = undefined;
			this.chromeEpoch = -1;
		}
		render(width: number): string[] {
			if (this.cachedLines && this.cachedWidth === width && this.cachedHovered === this.hovered
				&& this.chromeEpoch === deps.branchVisualEpoch()) return this.cachedLines;
			const safeWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
			if (safeWidth <= 0) {
				this.cachedWidth = width; this.cachedLines = [""]; this.chromeEpoch = deps.branchVisualEpoch(); return this.cachedLines;
			}
			const md = this.thinkingMarkdown();
			const gutter = deps.copySkip("   ");
			if (safeWidth <= 3) {
				this.cachedWidth = width; this.cachedHovered = this.hovered;
				this.cachedLines = [deps.clampLineWidth(gutter, safeWidth)]; this.chromeEpoch = deps.branchVisualEpoch(); return this.cachedLines;
			}
			const lines = deps.sanitizeRenderedTextBlockLines(md.render(safeWidth - 3));
			const displayLines = this.hovered ? lines.map(deps.brightenRenderedLine) : lines;
			const label = `${deps.workedLineFg()}${deps.copySkip("∴ Thinking:")}`;
			const rendered = [
				...(deps.thinkingLabelEnabled() ? [`${gutter}${this.hovered ? deps.brightenRenderedLine(label) : label}`] : []),
				...displayLines.map((line: string) => `${gutter}${line}`),
			].map((line) => deps.clampLineWidth(line, safeWidth));
			this.cachedWidth = width; this.cachedHovered = this.hovered; this.cachedLines = rendered;
			this.chromeEpoch = deps.branchVisualEpoch();
			return rendered;
		}
	}
	return { DottedParagraph, ThinkingParagraph };
}
