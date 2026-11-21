import { Container } from "@earendil-works/pi-tui";

export interface ContainerBorderDependencies {
	patchFlag: symbol;
	renderCacheKey: symbol;
	loadedResourcesFlag: symbol;
	isLoadedResourcesContainer: (container: any) => boolean;
	headerDetailsEnabled: () => boolean;
	isToolExecutionLike: (container: any) => boolean;
	toolBranchRenderCacheKey: () => string;
	toolBranchVisualEpoch: () => number;
	getToolBackgroundMode: () => "default" | "outlines" | "transparent";
	touchComponentRenderLru: (component: any) => void;
	storeToolRenderCache: (component: any, width: number, lines: string[], mouseLayout: unknown, branchCache: { branchKey: string; branchEpoch: number }) => string[];
	formatTodoOverlayLines: (lines: string[], width: number) => string[];
	isBlankLine: (line: string) => boolean;
	splitRenderedImageBlock: (lines: string[]) => { textLines: string[]; imageLines: string[] };
	normalizeLeadingCheckGlyph: (line: string) => string;
	stripOuterBackgroundAnsi: (line: string) => string;
	clampLineWidth: (line: string, width: number) => string;
	borderLine: (width: number) => string;
}

export function patchGlobalContainerBorders(deps: ContainerBorderDependencies): void {
	const proto = Container.prototype as any;
	if (proto[deps.patchFlag]) return;
	const originalRender = proto.render;
	proto.render = function patchedContainerRender(width: number): string[] {
		if (this[deps.loadedResourcesFlag] || deps.isLoadedResourcesContainer(this)) {
			if (!deps.headerDetailsEnabled()) {
				(this as { mouseLayout?: unknown }).mouseLayout = { width, children: [] };
				return [];
			}
		}
		if (deps.isToolExecutionLike(this)) {
			const cached = this[deps.renderCacheKey];
			const branchKey = deps.toolBranchRenderCacheKey();
			const mode = deps.getToolBackgroundMode();
			if (cached?.width === width && cached?.mode === mode
				&& cached?.branchKey === branchKey
				&& cached?.branchEpoch === deps.toolBranchVisualEpoch()) {
				deps.touchComponentRenderLru(this);
				if (cached.mouseLayout) (this as { mouseLayout?: unknown }).mouseLayout = cached.mouseLayout;
				return cached.lines;
			}
		}
		const rendered = originalRender.call(this, width);
		const mouseLayout = (this as { mouseLayout?: unknown }).mouseLayout;
		if (!Array.isArray(rendered) || rendered.length === 0) return rendered;
		const todoOverlay = deps.formatTodoOverlayLines(rendered, width);
		if (!deps.isToolExecutionLike(this)) return todoOverlay;
		const mode = deps.getToolBackgroundMode();
		const branchCache = { branchKey: deps.toolBranchRenderCacheKey(), branchEpoch: deps.toolBranchVisualEpoch() };
		if (mode === "default") return deps.storeToolRenderCache(this, width, rendered, mouseLayout, branchCache);
		let start = 0;
		while (start < rendered.length && deps.isBlankLine(rendered[start])) start++;
		let end = rendered.length - 1;
		while (end >= start && deps.isBlankLine(rendered[end])) end--;
		if (start > end) return rendered;
		const { textLines, imageLines } = deps.splitRenderedImageBlock(rendered.slice(start, end + 1));
		if (imageLines.length > 0) return deps.storeToolRenderCache(this, width, rendered, mouseLayout, branchCache);
		const core = textLines.map((line) => deps.clampLineWidth(
			deps.stripOuterBackgroundAnsi(deps.normalizeLeadingCheckGlyph(line)), width));
		const spacerLine = " ".repeat(width);
		let result: string[];
		if (mode === "outlines") {
			const ruleWidth = Math.max(1, width);
			const framed = core.length > 0 ? [deps.borderLine(ruleWidth), ...core, deps.borderLine(ruleWidth)] : [];
			result = [spacerLine, ...framed, ...imageLines];
		} else {
			result = [spacerLine, ...core, ...imageLines];
		}
		return deps.storeToolRenderCache(this, width, result, mouseLayout, branchCache);
	};
	proto[deps.patchFlag] = true;
}
