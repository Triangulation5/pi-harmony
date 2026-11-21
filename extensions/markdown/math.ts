import { Markdown, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export type MarkdownThemeLike = ConstructorParameters<typeof Markdown>[3];

export type ParagraphSegment =
	| { kind: "markdown"; md: InstanceType<typeof Markdown> }
	| { kind: "math"; raw: string };

interface MathDelimiter {
	open: string;
	close: string;
}

const DISPLAY_MATH_DELIMITERS: MathDelimiter[] = [
	{ open: "\\[", close: "\\]" },
	{ open: "$$", close: "$$" },
	{ open: "\\begin{equation}", close: "\\end{equation}" },
	{ open: "\\begin{equation*}", close: "\\end{equation*}" },
	{ open: "\\begin{align}", close: "\\end{align}" },
	{ open: "\\begin{align*}", close: "\\end{align*}" },
	{ open: "\\begin{aligned}", close: "\\end{aligned}" },
];

const MATH_COMMANDS: Record<string, string> = {
	alpha: "α", beta: "β", gamma: "γ", Gamma: "Γ", delta: "δ", Delta: "Δ",
	epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", Theta: "Θ",
	vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", Lambda: "Λ", mu: "μ",
	nu: "ν", xi: "ξ", Xi: "Ξ", pi: "π", Pi: "Π", rho: "ρ", varrho: "ϱ",
	sigma: "σ", Sigma: "Σ", tau: "τ", upsilon: "υ", Upsilon: "Υ", phi: "φ",
	varphi: "φ", Phi: "Φ", chi: "χ", psi: "ψ", Psi: "Ψ", omega: "ω", Omega: "Ω",
	pm: "±", mp: "∓", times: "×", cdot: "·", div: "÷", ast: "*", le: "≤", leq: "≤",
	ge: "≥", geq: "≥", neq: "≠", ne: "≠", approx: "≈", sim: "∼", propto: "∝",
	infty: "∞", partial: "∂", nabla: "∇", sum: "Σ", prod: "Π", int: "∫", sqrt: "√",
	to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", in: "∈", notin: "∉",
	cup: "∪", cap: "∩", subset: "⊂", subseteq: "⊆", superset: "⊃", superseteq: "⊇",
	wedge: "∧", vee: "∨", forall: "∀", exists: "∃", emptyset: "∅", degree: "°",
};

function codeSpan(text: string): string {
	const safe = text.replace(/`/g, "′");
	return `\`${safe}\``;
}

function looksLikeInlineMath(text: string): boolean {
	return /\\[A-Za-z]+|[_^=<>+*/-]/.test(text) && /[A-Za-z0-9}]/.test(text);
}

function hasInlineMathMarkers(text: string): boolean {
	return text.includes("\\(") || text.includes("$");
}

const MARKDOWN_CODE_REGION_RE = /(`{3,}[\s\S]*?`{3,}|`[^`\n]*`)/g;

interface CodeRegion {
	start: number;
	end: number;
}

function findMarkdownCodeRegions(text: string): CodeRegion[] {
	const regions: CodeRegion[] = [];
	MARKDOWN_CODE_REGION_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = MARKDOWN_CODE_REGION_RE.exec(text))) {
		regions.push({ start: match.index, end: match.index + match[0].length });
	}
	return regions;
}

function codeRegionContaining(regions: CodeRegion[], index: number): CodeRegion | undefined {
	return regions.find((region) => index >= region.start && index < region.end);
}

function replaceInlineMath(text: string): string {
	if (!hasInlineMathMarkers(text)) return text;
	const transform = (segment: string): string => {
		const withParens = segment.replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => {
			return codeSpan(formatMathForDisplay(body, false));
		});
		return withParens.replace(/(^|[^\\])\$([^\n$]{1,200})\$/g, (match, prefix: string, body: string) => {
			if (!looksLikeInlineMath(body)) return match;
			return `${prefix}${codeSpan(formatMathForDisplay(body, false))}`;
		});
	};
	const parts = text.split(MARKDOWN_CODE_REGION_RE);
	return parts.map((part, index) => index % 2 === 1 ? part : transform(part)).join("");
}

interface MathBlock {
	index: number;
	contentStart: number;
	contentEnd: number;
	endIndex: number;
}

function findNextDelimitedMathBlock(text: string, start: number): MathBlock | undefined {
	let best: MathBlock | undefined;
	for (const delimiter of DISPLAY_MATH_DELIMITERS) {
		const index = text.indexOf(delimiter.open, start);
		if (index === -1) continue;
		const contentStart = index + delimiter.open.length;
		const contentEnd = text.indexOf(delimiter.close, contentStart);
		if (contentEnd === -1) continue;
		if (!best || index < best.index) {
			best = { index, contentStart, contentEnd, endIndex: contentEnd + delimiter.close.length };
		}
	}
	return best;
}

function looksLikeDisplayMath(text: string): boolean {
	return /\\[A-Za-z]+|[_^=<>+*/|]/.test(text) && /[A-Za-z0-9}]/.test(text);
}

function findNextLooseBracketMathBlock(text: string, start: number): MathBlock | undefined {
	const openRe = /(^|\r?\n)[ \t]*\[[ \t]*(?:\r?\n)/g;
	openRe.lastIndex = start;
	let openMatch: RegExpExecArray | null;
	while ((openMatch = openRe.exec(text))) {
		const index = openMatch.index + openMatch[1].length;
		const contentStart = openMatch.index + openMatch[0].length;
		const closeRe = /(^|\r?\n)[ \t]*\][ \t]*(?=\r?\n|$)/g;
		closeRe.lastIndex = contentStart;
		const closeMatch = closeRe.exec(text);
		if (!closeMatch) return undefined;
		const contentEnd = closeMatch.index + closeMatch[1].length;
		const raw = text.slice(contentStart, contentEnd).trim();
		if (looksLikeDisplayMath(raw)) {
			return { index, contentStart, contentEnd, endIndex: closeMatch.index + closeMatch[0].length };
		}
		openRe.lastIndex = contentStart;
	}
	return undefined;
}

function hasDisplayMathMarkers(text: string): boolean {
	return text.includes("\\[") || text.includes("$$") || text.includes("\\begin{") || /(^|\n)[ \t]*\[[ \t]*(?:\r?\n)/.test(text);
}

function shouldScanLooseBracketMath(text: string): boolean {
	return text.length < 20_000 && /(^|\n)[ \t]*\[[ \t]*(?:\r?\n)/.test(text);
}

function findNextDisplayMathBlock(text: string, start: number, scanLoose: boolean): MathBlock | undefined {
	const delimited = findNextDelimitedMathBlock(text, start);
	const loose = scanLoose ? findNextLooseBracketMathBlock(text, start) : undefined;
	if (!delimited) return loose;
	if (!loose) return delimited;
	return loose.index < delimited.index ? loose : delimited;
}

function looksLikeMarkdownDocument(text: string): boolean {
	if (/\r?\n\s*\r?\n/.test(text)) return true;
	if (/^#{1,6}\s/m.test(text) || /```/.test(text)) return true;
	if (/^\s*[-*+]\s/m.test(text) || /^\s*\d+\.\s/m.test(text)) return true;
	if (/\|[^|\n]+\|/.test(text)) return true;
	if (/https?:\/\//.test(text)) return true;
	return false;
}

function shouldFormatStandaloneMath(text: string): boolean {
	const plain = text.trim();
	if (!plain || !plain.includes("\\")) return false;
	// Whole assistant paragraphs must stay markdown; misclassifying them collapses newlines.
	if (looksLikeMarkdownDocument(text)) return false;
	if (plain.length > 600 || plain.split(/\r?\n/).length > 3) return false;
	if (/\\(?:frac|dfrac|tfrac|sqrt|left|right|begin|end|partial|boldsymbol|bm|mathrm|mathbf|mathit|mathsf|mathtt|mathbb|sigma|epsilon|delta|gamma|Gamma|Delta|theta|Theta|pi|Pi|rho|varrho|tau|phi|varphi|Psi|psi|omega|Omega|alpha|beta|mu|nu|xi|chi|sum|prod|int|to|rightarrow|leftarrow|leftrightarrow|infty)/.test(plain)) {
		return true;
	}
	// Paths like \opencode and prose with "=" are not math; require tight expression shape.
	if (!/[_^]/.test(plain) || !/\\[A-Za-z]+/.test(plain)) return false;
	return !/[.!?]\s/.test(plain) && plain.length <= 240;
}

// Options Pi hands to the Markdown components it builds, including the markdown
// transformers (Pi's own Mermaid renderer, extension transformers, ...). Paragraph
// wrappers rebuild those components, so they have to forward the options.
export type MarkdownOptions = ConstructorParameters<typeof Markdown>[5]

function appendMarkdownSegment(
	segments: ParagraphSegment[],
	text: string,
	theme: MarkdownThemeLike,
	options?: MarkdownOptions,
): void {
	if (!text.trim()) return;
	const normalized = shouldFormatStandaloneMath(text) ? formatMathForDisplay(text, false) : replaceInlineMath(text);
	segments.push({ kind: "markdown", md: new Markdown(normalized, 0, 0, theme, undefined, options) });
}

export function buildParagraphSegments(
	text: string,
	theme: MarkdownThemeLike,
	options?: MarkdownOptions,
): ParagraphSegment[] {
	const segments: ParagraphSegment[] = [];
	if (!hasDisplayMathMarkers(text)) {
		appendMarkdownSegment(segments, text, theme, options);
		return segments;
	}
	const scanLoose = shouldScanLooseBracketMath(text);
	// Code regions are computed once for the whole paragraph: a display-math
	// candidate must be rejected before its fence gets cut into separate
	// Markdown segments (issue #33, sibling of the inline fix in 2ccd158).
	const codeRegions = findMarkdownCodeRegions(text);
	// `cursor` marks the start of prose not yet emitted; `scanFrom` only advances
	// past rejected code regions so skipped candidates never erase prose.
	let cursor = 0;
	let scanFrom = 0;
	while (scanFrom < text.length) {
		let next = findNextDisplayMathBlock(text, scanFrom, scanLoose);
		// Math delimiters found inside a fenced block or code span are literal
		// source, not math. Resume the scan after that code region so a later
		// genuine `$$ ... $$` in prose is still honored.
		while (next) {
			const region = codeRegionContaining(codeRegions, next.index);
			if (!region) break;
			scanFrom = region.end;
			next = findNextDisplayMathBlock(text, scanFrom, scanLoose);
		}
		if (!next) break;
		appendMarkdownSegment(segments, text.slice(cursor, next.index), theme, options);
		const raw = text.slice(next.contentStart, next.contentEnd).trim();
		if (raw) segments.push({ kind: "math", raw });
		cursor = next.endIndex;
		scanFrom = next.endIndex;
	}
	appendMarkdownSegment(segments, text.slice(cursor), theme, options);
	return segments;
}

function replaceSimpleCommandGroups(text: string): string {
	return text
		.replace(/\\(?:text|mathrm|operatorname|mathbf|boldsymbol|bm|mathit|mathsf|mathtt)\{([^{}]*)\}/g, "$1")
		.replace(/\\(?:boldsymbol|bm)\s+([A-Za-z])/g, "$1")
		.replace(/\\mathbb\{R\}/g, "ℝ")
		.replace(/\\mathbb\{N\}/g, "ℕ")
		.replace(/\\mathbb\{Z\}/g, "ℤ")
		.replace(/\\mathbb\{Q\}/g, "ℚ")
		.replace(/\\mathbb\{C\}/g, "ℂ");
}

function readLatexGroup(text: string, start: number): { content: string; end: number } | undefined {
	let open = start;
	while (open < text.length && /\s/.test(text[open])) open++;
	if (text[open] !== "{") return undefined;
	let depth = 1;
	for (let index = open + 1; index < text.length; index++) {
		const char = text[index];
		if (char === "{") depth++;
		else if (char === "}") {
			depth--;
			if (depth === 0) return { content: text.slice(open + 1, index), end: index + 1 };
		}
	}
	return undefined;
}

function replaceFractions(text: string): string {
	let output = "";
	let index = 0;
	while (index < text.length) {
		const command = ["\\frac", "\\dfrac", "\\tfrac"].find((candidate) => text.startsWith(candidate, index));
		if (!command) {
			output += text[index];
			index++;
			continue;
		}
		const numerator = readLatexGroup(text, index + command.length);
		const denominator = numerator ? readLatexGroup(text, numerator.end) : undefined;
		if (!numerator || !denominator) {
			output += text[index];
			index++;
			continue;
		}
		output += `(${replaceFractions(numerator.content)})/(${replaceFractions(denominator.content)})`;
		index = denominator.end;
	}
	return output;
}

function replaceMathCommands(text: string): string {
	return text.replace(/\\([A-Za-z]+)/g, (match, name: string) => MATH_COMMANDS[name] ?? match);
}

function formatMathForDisplay(raw: string, multiline = true): string {
	let text = raw.replace(/\\\\/g, "\n");
	text = text.replace(/\\(?:begin|end)\{[^{}]+\}/g, "").replace(/&/g, "");
	text = replaceSimpleCommandGroups(text);
	text = replaceFractions(text);
	text = text.replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)");
	text = replaceMathCommands(text);
	text = text.replace(/\\(?:left|right|big|Big|bigg|Bigg)/g, "");
	text = text.replace(/_\{([^{}]+)\}/g, "_$1").replace(/\^\{([^{}]+)\}/g, "^$1");
	text = text.replace(/[{}]/g, "").replace(/\\[,;!]/g, " ").replace(/\\ /g, " ");
	text = text.replace(/[ \t]+/g, " ").replace(/\s*([=+\-×·÷<>≤≥≈≠|])\s*/g, " $1 ");
	const lines = text.split(/\r?\n/).map((line) => line.replace(/[ \t]{2,}/g, " ").trim()).filter(Boolean);
	return multiline ? lines.join("\n") : lines.join(" ");
}

export function renderMathBlock(raw: string, width: number, theme: MarkdownThemeLike): string[] {
	const safeWidth = Math.max(12, width);
	const formatted = formatMathForDisplay(raw, true) || raw;
	return formatted
		.split("\n")
		.flatMap((line) => wrapTextWithAnsi(theme.bold(line), safeWidth));
}

