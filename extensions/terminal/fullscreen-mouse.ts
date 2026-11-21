import * as PiTui from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";

export interface TuiMouseEvent {
	type: string;
	button: string;
	x: number;
	y: number;
	screenX: number;
	screenY: number;
	width: number;
	height: number;
	clickCount?: number;
}
export interface TuiMouseEventResult {
	handled?: boolean;
	capture?: boolean;
	focus?: boolean;
	render?: boolean;
}
export interface TuiMouseDispatchResult extends TuiMouseEventResult {
	handled: true;
	target: {
		component: Component;
		originX: number;
		originY: number;
		width: number;
		height: number;
	};
}
export type MouseLayoutEntry = { component?: any; height: number; top: number };

function unrefTimer(timer: ReturnType<typeof setTimeout> | null | undefined): void {
	(timer as any)?.unref?.();
}

interface PendingReveal {
	view: any;
	/** Row top in transcript content lines, when known. */
	top?: number;
	component: any;
	width: number;
	until: number;
}
let pendingReveal: PendingReveal | undefined;
const SCROLL_VIEW_PATCH_FLAG = Symbol.for("pi-claude-style-tools:scroll-view-reveal");

/** Screen rect of a scroll view in the TUI's last layout. */
function scrollViewRect(tui: any, view: any): { y: number; height: number } | undefined {
	const visit = (box: any): any => {
		if (!box) return undefined;
		if (box.scrollView === view) return box.rect;
		for (const child of box.children ?? []) {
			const found = visit(child);
			if (found) return found;
		}
		return undefined;
	};
	return visit(tui?.currentLayout?.root);
}

export function keepClickedRowInPlace(ui: any, expanding: boolean, component?: any, event?: TuiMouseEvent): void {
	if (!expanding) return;
	clickOpenedRow = true;
	try {
		const tui = typeof ui?.getPrimaryScrollView === "function" ? ui : mouseDispatchTui;
		const view = tui?.getPrimaryScrollView?.();
		if (!view || typeof view.scrollTo !== "function") return;
		if (view.isFollowingEnd === true) view.scrollTo(view.scrollTop, { disableFollow: true });
		const screenY = (event as any)?.screenY;
		const rect = scrollViewRect(tui, view);
		pendingReveal = {
			view,
			top: component && event && typeof screenY === "number" && rect ? view.scrollTop + (screenY - event.y - rect.y) : undefined,
			component,
			width: event?.width ?? 0,
			until: Date.now() + 1000,
		};
	} catch { /* regular (non-fullscreen) mode has no scroll view */ }
}

/**
 * Scroll position that shows a just-expanded row: unchanged if it fits below, otherwise down
 * just enough to show its end, but never past its header.
 */
export function revealScrollTop(rowTop: number, rowHeight: number, scrollTop: number, viewportHeight: number): number {
	if (rowHeight <= 0 || viewportHeight <= 0) return scrollTop;
	const overflow = rowTop + rowHeight - (scrollTop + viewportHeight);
	if (overflow <= 0) return scrollTop;
	return Math.max(scrollTop, Math.min(scrollTop + overflow, rowTop));
}

export function patchScrollViewReveal(): void {
	const proto = (PiTui as any).ScrollView?.prototype;
	if (!proto || proto[SCROLL_VIEW_PATCH_FLAG] || typeof proto.updateLayout !== "function") return;
	const original = proto.updateLayout;
	proto.updateLayout = function patchedUpdateLayout(this: any, ...args: any[]) {
		const result = original.apply(this, args);
		const reveal = pendingReveal;
		if (!reveal || reveal.view !== this) return result;
		pendingReveal = undefined;
		if (Date.now() > reveal.until) return result;
		try {
			const viewport = this.viewportHeight;
			if (reveal.top !== undefined && reveal.component && reveal.width > 0) {
				const height = reveal.component.render(reveal.width)?.length ?? 0;
				const target = revealScrollTop(reveal.top, height, this.scrollTop, viewport);
				if (target !== this.scrollTop) this.scrollTo(target);
			}
			// Still at the bottom (the row fit, or did not grow): keep following the end, so
			// new output keeps scrolling in and no "jump to latest" prompt appears.
			const maxScrollTop = Math.max(0, (this.contentHeight ?? 0) - viewport);
			if (this.scrollTop >= maxScrollTop && this.isFollowingEnd !== true) this.scrollTo(maxScrollTop);
		} catch { /* layout changed under us */ }
		return result;
	};
	proto[SCROLL_VIEW_PATCH_FLAG] = true;
}

export function toggleExpandedComponent(component: any, event?: TuiMouseEvent): boolean {
	if (!component || typeof component.setExpanded !== "function") return false;
	const expanding = component.expanded !== true;
	keepClickedRowInPlace(component.ui, expanding, component, event);
	component.setExpanded(expanding);
	return true;
}

export function requestComponentRender(component: any): void {
	const ui = component?.ui;
	if (typeof ui?.requestRender === "function") ui.requestRender();
}

const GROUP_HOVER_KEY = Symbol.for("pi-claude-style-tools:group-hover");

export function getGroupHover(group: object): unknown {
	return (group as any)[GROUP_HOVER_KEY];
}

export function setGroupHover(group: any, rowStart: number): boolean {
	if (group[GROUP_HOVER_KEY] === rowStart) return false;
	group[GROUP_HOVER_KEY] = rowStart;
	return true;
}

export function mouseLayoutTarget(
	layout: { width: number; children: MouseLayoutEntry[] } | undefined,
	event: TuiMouseEvent,
): MouseLayoutEntry | undefined {
	if (!layout || layout.width !== event.width || event.y < 0 || event.y >= event.height) return undefined;
	return layout.children.find((entry) => event.y >= entry.top && event.y < entry.top + entry.height);
}

export function dispatchTarget(
	component: Component,
	event: TuiMouseEvent,
	result: TuiMouseEventResult | undefined,
): TuiMouseDispatchResult | undefined {
	if (!result) return undefined;
	return {
		...result,
		handled: true,
		target: {
			component,
			originX: event.screenX - event.x,
			originY: event.screenY - event.y,
			width: event.width,
			height: event.height,
		},
	};
}

export function toggleGroupedTools(group: any, tools: any[], event?: TuiMouseEvent): { handled: true } | undefined {
	const targets = tools.filter((tool) => typeof tool?.setExpanded === "function");
	if (targets.length === 0) return undefined;
	// Shown open (any call expanded) → close all; shown closed → open all.
	const expanded = !targets.some((tool) => tool.expanded === true);
	keepClickedRowInPlace(targets.find((tool) => tool?.ui)?.ui, expanded, group, event);
	for (const tool of targets) tool.setExpanded(expanded);
	if (Array.isArray(group?.tools)) group.expanded = group.tools.some((tool: any) => tool?.expanded === true);
	group.invalidate?.();
	const ui = targets.find((tool) => typeof tool?.ui?.requestRender === "function")?.ui;
	ui?.requestRender?.();
	return { handled: true };
}

let hoveredClickTarget: { owner: object; clear: () => void } | undefined;

export function forgetClickHover(owner: object): void {
	if (hoveredClickTarget?.owner === owner) hoveredClickTarget = undefined;
}

/** The fullscreen TUI dispatching the current mouse event (components like assistant messages have no `ui`). */
let mouseDispatchTui: any;
let hoverClaimedThisMove = false;

// pi counts a click only when the press and the release land on the same cell, so a pointer
// that drifts across a cell edge while clicking (a trackpad press often does) selected a
// character instead of expanding the row. Within one cell of the press, moves are dropped and
// the release is reported where the press was. Farther moves are drags, as before.
const CLICK_SLOP_CELLS = 1;
let mousePress: { x: number; y: number; dragging: boolean } | undefined;

// While the transcript follows its end, new output scrolls it, and pi compares a press and its
// release by their place in the transcript: a line arriving mid-click turned the click into a
// selection. Hold the view still while the left button is down, then follow again, unless the
// click opened a row (which keeps it in place) or something else scrolled the view meanwhile
// (a scrollbar drag, the wheel).
let heldView: { view: any; top: number; timer?: ReturnType<typeof setTimeout> } | undefined;
let clickOpenedRow = false;

type RawMouseEvent = { button: number; x: number; y: number; release?: boolean };

/** pi's raw mouse handling with the click fixes around it: slop, and a held view while pressed. */
export function dispatchMouseWithClickFixes(tui: any, input: RawMouseEvent, original: (raw: RawMouseEvent) => unknown): unknown {
	const raw = applyClickSlop(input);
	if (!raw) return undefined;
	const leftButton = (raw.button & 64) === 0 && (raw.button & 3) === 0;
	const leftPress = leftButton && (raw.button & 32) === 0 && !raw.release;
	const leftRelease = leftButton && raw.release === true;
	if (leftPress) holdViewForPress(tui, raw.x, raw.y);
	else if (leftButton && (raw.button & 32) !== 0) armHeldViewTimer(tui); // still dragging
	if (leftRelease) clickOpenedRow = false;
	const result = original(raw);
	if (leftRelease) releaseHeldView(true, tui);
	return result;
}

function holdViewForPress(tui: any, x: number, y: number): void {
	releaseHeldView(false);
	try {
		const view = tui?.getPrimaryScrollView?.();
		if (!view || view.isFollowingEnd !== true || typeof view.scrollTo !== "function") return;
		// Only presses in the transcript need the hold. A click in the editor (to move the
		// cursor) must not stop the transcript from following its end, which also showed
		// pi's "Jump to latest message" indicator while the button was down.
		if (!pressInsideScrollView(tui, view, x, y)) return;
		view.scrollTo(view.scrollTop, { disableFollow: true });
		heldView = { view, top: view.scrollTop };
		// A release can go missing (the pointer left the window); never stay held.
		armHeldViewTimer(tui);
	} catch { /* no scroll view in regular mode */ }
}

function armHeldViewTimer(tui: any): void {
	if (!heldView) return;
	if (heldView.timer) clearTimeout(heldView.timer);
	heldView.timer = setTimeout(() => releaseHeldView(true, tui), 8000);
	unrefTimer(heldView.timer);
}

function releaseHeldView(follow: boolean, tui?: any): void {
	const held = heldView;
	heldView = undefined;
	if (!held) return;
	if (held.timer) clearTimeout(held.timer);
	if (!follow || clickOpenedRow) return;
	try {
		const view = held.view;
		if (view.isFollowingEnd === true || typeof view.scrollToEnd !== "function") return;
		// Still where the press left it, or still at the end (a layout change while held, e.g. a
		// status row disappearing, clamps scrollTop without any intentional scrolling).
		const maxTop = Math.max(0, (Number(view.contentHeight) || 0) - (Number(view.viewportHeight) || 0));
		if (view.scrollTop === held.top || view.scrollTop === maxTop) {
			view.scrollToEnd();
			tui?.requestRender?.();
		}
	} catch { /* view gone */ }
}

/** Whether a screen cell lies inside the scroll view's box of the current fullscreen layout. */
export function pressInsideScrollView(tui: any, view: any, x: number, y: number): boolean {
	const root = tui?.currentLayout?.root;
	if (!root) return true; // no layout to check against: keep the old behaviour
	const find = (box: any): any => {
		if (box?.scrollView === view) return box;
		for (const child of box?.children ?? []) {
			const match = find(child);
			if (match) return match;
		}
		return undefined;
	};
	const box = find(root);
	if (!box?.rect) return true;
	const r = box.rect;
	return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}

/** The mouse event pi should see, or undefined to drop it (a tiny move while pressed). */
export function applyClickSlop<T extends { button: number; x: number; y: number; release?: boolean }>(raw: T): T | undefined {
	const button = raw.button;
	const wheel = (button & 64) !== 0;
	const motion = (button & 32) !== 0;
	const left = !wheel && (button & 3) === 0;
	if (!left) return raw;
	if (!motion && !raw.release) {
		mousePress = { x: raw.x, y: raw.y, dragging: false };
		return raw;
	}
	const press = mousePress;
	if (!press) return raw;
	if (raw.release) mousePress = undefined;
	if (press.dragging) return raw;
	const near = Math.abs(raw.x - press.x) <= CLICK_SLOP_CELLS && Math.abs(raw.y - press.y) <= CLICK_SLOP_CELLS;
	if (!near) {
		press.dragging = true;
		return raw;
	}
	if (motion) return undefined;
	return raw.x === press.x && raw.y === press.y ? raw : { ...raw, x: press.x, y: press.y };
}

export function claimClickHover(owner: object, clear: () => void): void {
	hoverClaimedThisMove = true;
	if (hoveredClickTarget?.owner === owner) return;
	const previous = hoveredClickTarget;
	hoveredClickTarget = { owner, clear };
	previous?.clear();
}

const FULLSCREEN_HOVER_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-fullscreen-hover");

export function patchFullscreenHoverExit(): void {
	const proto = (PiTui as any).TuiAltScreen?.prototype;
	if (!proto || proto[FULLSCREEN_HOVER_PATCH_FLAG] || typeof proto.handleMouseEvent !== "function") return;
	const originalHandleMouse = proto.handleMouseEvent;
	proto.handleMouseEvent = function patchedFullscreenMouseEvent(input: RawMouseEvent) {
		mouseDispatchTui = this;
		const isMove = (input.button & 35) === 35;
		if (isMove) hoverClaimedThisMove = false;
		const result = dispatchMouseWithClickFixes(this, input, (raw) => originalHandleMouse.call(this, raw));
		if (isMove && !hoverClaimedThisMove && hoveredClickTarget) {
			const previous = hoveredClickTarget;
			hoveredClickTarget = undefined;
			previous.clear();
			this.requestRender();
		}
		return result;
	};
	if (typeof proto.handleViewportInput === "function") {
		const originalInput = proto.handleViewportInput;
		proto.handleViewportInput = function patchedFullscreenInput(data: string) {
			if (data === "\x1b[O" && hoveredClickTarget) {
				const previous = hoveredClickTarget;
				hoveredClickTarget = undefined;
				previous.clear();
				this.requestRender();
			}
			return originalInput.call(this, data);
		};
	}
	proto[FULLSCREEN_HOVER_PATCH_FLAG] = true;
}

