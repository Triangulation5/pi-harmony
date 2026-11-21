export {
	MAX_PREVIEW_LINES,
	MAX_RENDER_LINES,
	DIFF_RENDER_CONCURRENCY,
	configureDiffRendering,
} from "./types.ts";
export type {
	DiffApi,
	DiffColors,
	DiffLine,
	DiffPalette,
	DiffRenderSettings,
	DiffRenderingDependencies,
	ParsedDiff,
} from "./types.ts";
export {
	branchDiffWidth,
	contextDiffWidth,
	diffSummaryWithMeta,
	shouldUseSplit,
	summarizeDiff,
} from "./layout.ts";
export { clearHighlightCache, lang, mapWithConcurrency } from "./highlight.ts";
export { getCachedParsedDiff, parseDiff } from "./parse.ts";
export { renderSplit, renderUnified } from "./renderers.ts";
