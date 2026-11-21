import { Loader } from "@earendil-works/pi-tui";
import { readMergedSettings } from "../../settings/store.ts";
import { readSpinnerSettings, type SpinnerSpeed, RAW_ANSI_RE, getClaudeOrange } from "./spinner-settings.ts";

export function unrefTimer(timer: ReturnType<typeof setTimeout> | null | undefined): void {
	(timer as any)?.unref?.();
}

const LOADER_INTERVALS_MS: Record<SpinnerSpeed, number> = { slow: 260, medium: 170, fast: 110 };
const LOADER_LAST_TEXT = Symbol.for("pi-claude-style-tools:loader-last-text");
const LOADER_ACTIVE = Symbol.for("pi-claude-style-tools:loader-active");
const LOADER_GENERATION = Symbol.for("pi-claude-style-tools:loader-generation");
const ACTIVE_UI_SYMBOL = Symbol.for("pi-claude-style-tools:active-ui");

function getDefaultSpinnerCharacters(): string[] {
	if (process.env.TERM === "xterm-ghostty") return ["·", "✢", "✳", "✶", "✻", "✽"];
	return process.platform === "darwin"
		? ["·", "✢", "✳", "✶", "✻", "✽"]
		: ["·", "✢", "*", "✶", "✻", "✽"];
}

const SPINNER_CHARS = getDefaultSpinnerCharacters();
const BREATHING_FRAMES = ["·", "✧", "✦", "✶", "✹", "✶", "✦", "✧"];
const ORBIT_FRAMES = ["○", "◎", "◉", "●"];
const ASTERISK_FRAMES = [...SPINNER_CHARS, ...[...SPINNER_CHARS].reverse()];

function stopLoaderIfUiStopped(loader: any): boolean {
	if (!loader?.ui || !(loader.ui as any).stopped) return false;
	loader.stop?.();
	return true;
}

export function patchSpinnerLoader(): void {
	const originalUpdate = (Loader.prototype as any).updateDisplay;
	const originalStart = Loader.prototype.start;
	const originalStop = Loader.prototype.stop;

	(Loader.prototype as any).updateDisplay = function patchedUpdateDisplay() {
		if (readMergedSettings().claudeUi === false) return originalUpdate?.call(this);
		if (stopLoaderIfUiStopped(this)) return;
		const style = readSpinnerSettings().style;
		const frames = style === "breathing" ? BREATHING_FRAMES : style === "orbit" ? ORBIT_FRAMES : ASTERISK_FRAMES;
		const frame = frames[this.currentFrame % frames.length];
		const themedMessage = typeof this.message === "string" && RAW_ANSI_RE.test(this.message);
		const message = themedMessage ? this.message : this.messageColorFn(this.message);
		const glyph = themedMessage ? `${getClaudeOrange()}${frame}\u001b[0m` : this.spinnerColorFn(frame);
		const nextText = `${glyph} ${message}`;
		if ((this as any)[LOADER_LAST_TEXT] === nextText) return;
		(this as any)[LOADER_LAST_TEXT] = nextText;
		this.setText(nextText);
		if (this.ui && !(this.ui as any).stopped) {
			(globalThis as any)[ACTIVE_UI_SYMBOL] = this.ui;
			this.ui.requestRender();
		}
	};

	Loader.prototype.start = function patchedStart() {
		if (readMergedSettings().claudeUi === false) return originalStart?.call(this);
		this.stop();
		(this as any)[LOADER_ACTIVE] = true;
		const generation = ((this as any)[LOADER_GENERATION] ?? 0) + 1;
		(this as any)[LOADER_GENERATION] = generation;
		delete (this as any)[LOADER_LAST_TEXT];
		(this as any).updateDisplay();
		const styleFrames = readSpinnerSettings().style;
		const frames = styleFrames === "breathing" ? BREATHING_FRAMES : styleFrames === "orbit" ? ORBIT_FRAMES : ASTERISK_FRAMES;
		if (frames.length <= 1 || stopLoaderIfUiStopped(this)) return;
		const scheduleNext = () => {
			if ((this as any)[LOADER_ACTIVE] !== true || (this as any)[LOADER_GENERATION] !== generation || stopLoaderIfUiStopped(this)) return;
			const interval = LOADER_INTERVALS_MS[readSpinnerSettings().speed];
			const timer = setTimeout(() => {
				(this as any).intervalId = null;
				if ((this as any)[LOADER_ACTIVE] !== true || (this as any)[LOADER_GENERATION] !== generation || stopLoaderIfUiStopped(this)) return;
				const currentFrames = readSpinnerSettings().style === "breathing" ? BREATHING_FRAMES : readSpinnerSettings().style === "orbit" ? ORBIT_FRAMES : ASTERISK_FRAMES;
				(this as any).currentFrame = ((this as any).currentFrame + 1) % currentFrames.length;
				(this as any).updateDisplay();
				scheduleNext();
			}, interval);
			unrefTimer(timer);
			(this as any).intervalId = timer;
		};
		scheduleNext();
	};

	Loader.prototype.stop = function patchedStop() {
		if (readMergedSettings().claudeUi === false) return originalStop?.call(this);
		(this as any)[LOADER_ACTIVE] = false;
		(this as any)[LOADER_GENERATION] = ((this as any)[LOADER_GENERATION] ?? 0) + 1;
		if ((this as any).intervalId) {
			clearTimeout((this as any).intervalId);
			(this as any).intervalId = null;
		}
	};
}
