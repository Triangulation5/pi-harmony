import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export const COPY_MARK_PREFIX = "\x1b]8686;";
export const COPY_SKIP_START = `${COPY_MARK_PREFIX}s\x07`;
export const COPY_SKIP_END = `${COPY_MARK_PREFIX}e\x07`;
export const COPY_DROP_LINE = `${COPY_MARK_PREFIX}d\x07`;
export const OSC133_ZONE_START = "\x1b]133;A\x07";
export const OSC133_ZONE_END = "\x1b]133;B\x07";
export const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

const COPY_MARK_RE = /\x1b\]8686;[a-z]\x07/g;
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const PI_CODE_BLOCK_INDENT = "  ";
const PLAIN_FENCE_LANGS = new Set(["text", "txt", "plain", "plaintext", ""]);

export interface CopyFormattingStyle {
	borderColor: string;
	codeBlockLanguageFg: string;
	chromeItalic: string;
	reset: string;
	transparentReset: string;
}

export function createCopyFormatting(getStyle: () => CopyFormattingStyle) {
	function stripCopyMarks(text: string): string {
		return text.includes(COPY_MARK_PREFIX) ? text.replace(COPY_MARK_RE, "") : text;
	}

	function stripAnsi(text: string): string {
		return stripCopyMarks(text.replace(ANSI_RE, ""));
	}

	function copySkip(text: string): string {
		return text ? `${COPY_SKIP_START}${text}${COPY_SKIP_END}` : text;
	}

	function removeCopySkipped(slice: string): string {
		if (!slice.includes(COPY_MARK_PREFIX)) return slice;
		let out = "";
		let skipping = false;
		let i = 0;
		while (i < slice.length) {
			const at = slice.indexOf(COPY_MARK_PREFIX, i);
			const stop = at === -1 ? slice.length : at;
			if (!skipping) out += slice.slice(i, stop);
			if (at === -1) break;
			const kind = slice[at + COPY_MARK_PREFIX.length];
			if (kind === "s") skipping = true;
			else if (kind === "e") skipping = false;
			i = at + COPY_MARK_PREFIX.length + 2;
		}
		return out;
	}

	function copySkipCodeIndent(line: string): string {
		return line.startsWith(PI_CODE_BLOCK_INDENT)
			? `${copySkip(PI_CODE_BLOCK_INDENT)}${line.slice(PI_CODE_BLOCK_INDENT.length)}`
			: line;
	}

	function stripRenderedHeadingMarkers(line: string): string {
		return line.replace(/^((?:\x1b\[[0-9;]*m|[ \t])*)#{3,6}[ \t]*((?:\x1b\[[0-9;]*m)*)/, "$1$2");
	}

	function parseRenderedFenceLine(line: string): { kind: "open" | "close"; language: string } | undefined {
		const plain = stripAnsi(line).trim();
		if (plain === "```") return { kind: "close", language: "" };
		if (!plain.startsWith("```")) return undefined;
		const rest = plain.slice(3).trim();
		if (rest.includes("`")) return undefined;
		return { kind: "open", language: rest };
	}

	function formatCodeBlockLanguageLabel(language: string): string {
		const raw = language.trim();
		if (!raw) return "";
		return raw.toLowerCase();
	}

	function mutedDotFill(count: number): string {
		if (count <= 0) return "";
		const style = getStyle();
		return `${style.borderColor}${"·".repeat(count)}${style.transparentReset}`;
	}

	function terminalColumnCeiling(): number {
		const cols = typeof process !== "undefined" ? process.stdout?.columns : undefined;
		return Number.isFinite(cols) && (cols as number) > 0 ? (cols as number) : 0;
	}

	function padRenderedLineToWidth(line: string, width: number): string {
		if (width <= 0) return "";
		const ceiling = Math.min(width, terminalColumnCeiling() || width);
		const gap = ceiling - visibleWidth(line);
		if (gap <= 0) return line;
		return line + " ".repeat(gap);
	}

	function isCodeBoxChromeLine(line: string): boolean {
		const plain = stripAnsi(line).trim();
		if (!plain) return false;
		if (/^[╭╮╰╯│·\s]+$/.test(plain) && /[╭╮╰╯│]/.test(plain)) return true;
		if (/^╭/.test(plain) && /╮$/.test(plain)) return true;
		if (/^╰/.test(plain) && /╯$/.test(plain)) return true;
		return false;
	}

	function isUserMessageChromeLine(line: string): boolean {
		const plain = stripAnsi(line).trim();
		if (/^╭/.test(plain) && /╮$/.test(plain)) return true;
		if (/^╰/.test(plain) && /╯$/.test(plain)) return true;
		return false;
	}

	function isBorderedContentLine(line: string): boolean {
		const plain = stripAnsi(line).trim();
		return plain.startsWith("│") && plain.endsWith("│") && plain.length > 2;
	}

	function extractBorderedInnerForCopy(line: string): string {
		const plain = stripAnsi(line);
		const start = plain.indexOf("│");
		const end = plain.lastIndexOf("│");
		if (start === -1 || end <= start) return stripAnsi(line).trim();
		return plain.slice(start + 1, end).replace(/^\s+/, "").replace(/\s+$/, "");
	}

	function isCopyExcludedChromeLine(line: string): boolean {
		return isCodeBoxChromeLine(line) || isUserMessageChromeLine(line);
	}

	function copyPayloadForLine(line: string): string | undefined {
		if (isCopyExcludedChromeLine(line)) return undefined;
		if (isBorderedContentLine(line)) return extractBorderedInnerForCopy(line);
		const plain = stripAnsi(line).trim();
		if (!plain) return undefined;
		return plain;
	}

	function applyTerminalCopyZones(lines: string[]): string[] {
		if (!Array.isArray(lines) || lines.length === 0) return lines;
		const out: string[] = [];
		let inZone = false;
		for (const line of lines) {
			if (isCopyExcludedChromeLine(line)) {
				if (inZone) {
					out[out.length - 1] += OSC133_ZONE_END;
					inZone = false;
				}
				out.push(line);
				continue;
			}
			const payload = copyPayloadForLine(line);
			if (!payload) {
				out.push(line);
				continue;
			}
			if (!inZone) {
				out.push(`${OSC133_ZONE_START}${line}`);
				inZone = true;
			} else {
				out.push(line);
			}
		}
		if (inZone && out.length > 0) out[out.length - 1] += OSC133_ZONE_END + OSC133_ZONE_FINAL;
		return out;
	}

	function roundedCodeBlockTop(width: number, language: string): string {
		const style = getStyle();
		if (width <= 1) return `${style.borderColor}│${style.transparentReset}`;
		const label = formatCodeBlockLanguageLabel(language);
		if (!label || width < 8) {
			const inner = Math.max(0, width - 2);
			return `${style.borderColor}╭${style.transparentReset}${mutedDotFill(inner)}${style.borderColor}╮${style.transparentReset}`;
		}
		const labelStyled = `${style.codeBlockLanguageFg}${style.chromeItalic}${label}${style.reset}${style.transparentReset}`;
		const labelW = visibleWidth(labelStyled);
		const dotCount = Math.max(0, width - 6 - labelW);
		return `${style.borderColor}╭· ${style.transparentReset}${labelStyled} ${mutedDotFill(dotCount)}${style.borderColor} ╮${style.transparentReset}`;
	}

	function roundedCodeBlockBottom(width: number): string {
		const style = getStyle();
		if (width <= 1) return `${style.borderColor}│${style.transparentReset}`;
		const inner = Math.max(0, width - 2);
		return `${style.borderColor}╰${style.transparentReset}${mutedDotFill(inner)}${style.borderColor}╯${style.transparentReset}`;
	}

	function borderedCodeBlockLine(line: string, width: number): string {
		const innerWidth = Math.max(1, width - 4);
		let content = line;
		if (visibleWidth(content) > innerWidth) content = truncateToWidth(content, innerWidth, "", false);
		const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(content)));
		const indent = content.startsWith(PI_CODE_BLOCK_INDENT) ? PI_CODE_BLOCK_INDENT : "";
		const code = content.slice(indent.length);
		const style = getStyle();
		const left = copySkip(`${style.borderColor}│${style.transparentReset} ${indent}`);
		const right = copySkip(` ${style.borderColor}│${style.transparentReset}`);
		return `${left}${code}${padding}${right}`;
	}

	function boxRenderedCodeBlock(bodyLines: string[], language: string, width: number): string[] {
		const safeWidth = Math.max(4, Number.isFinite(width) ? Math.floor(width) : 0);
		const framed = [
			`${COPY_DROP_LINE}${roundedCodeBlockTop(safeWidth, language)}`,
			...bodyLines.map((line) => borderedCodeBlockLine(line, safeWidth)),
			`${COPY_DROP_LINE}${roundedCodeBlockBottom(safeWidth)}`,
		];
		return framed.map((line) => padRenderedLineToWidth(line, safeWidth));
	}

	function sanitizeRenderedTextBlockLines(lines: string[], width?: number): string[] {
		const result: string[] = [];
		let i = 0;
		const canBox = typeof width === "number" && width > 0;
		while (i < lines.length) {
			const fence = parseRenderedFenceLine(lines[i]);
			if (fence?.kind === "open") {
				const language = fence.language;
				const hideBox = PLAIN_FENCE_LANGS.has(language.trim().toLowerCase());
				const body: string[] = [];
				i++;
				while (i < lines.length) {
					const close = parseRenderedFenceLine(lines[i]);
					if (close?.kind === "close") {
						i++;
						break;
					}
					body.push(lines[i]);
					i++;
				}
				if (!hideBox && canBox && (body.length > 0 || language.trim())) {
					result.push(...boxRenderedCodeBlock(body, language, width));
				} else {
					result.push(...body.map(copySkipCodeIndent));
				}
				continue;
			}
			if (fence?.kind === "close") {
				i++;
				continue;
			}
			result.push(stripRenderedHeadingMarkers(lines[i]).replace(/###/g, ""));
			i++;
		}
		return result;
	}

	return {
		stripCopyMarks,
		stripAnsi,
		copySkip,
		removeCopySkipped,
		padRenderedLineToWidth,
		isCodeBoxChromeLine,
		applyTerminalCopyZones,
		sanitizeRenderedTextBlockLines,
	};
}
