import assert from "node:assert/strict";
import { test } from "node:test";
import continueExtension, {
	isTmuxSession,
	TMUX_SHIFT_ALT_ENTER_SEQUENCES,
} from "../../extensions/session/continue.ts";

interface MockShortcut {
	description?: string;
	handler: (ctx: any) => Promise<void> | void;
}

test("continue extension registers shift+alt+enter shortcut", () => {
	const shortcuts = new Map<string, MockShortcut>();
	const handlers = new Map<string, (event: any, ctx: any) => void>();
	const sentMessages: string[] = [];

	const mockPi: any = {
		registerShortcut(key: string, options: MockShortcut) {
			shortcuts.set(key, options);
		},
		on(event: string, handler: (event: any, ctx: any) => void) {
			handlers.set(event, handler);
		},
		sendUserMessage(msg: string) {
			sentMessages.push(msg);
		},
	};

	continueExtension(mockPi);

	assert.ok(shortcuts.has("shift+alt+enter"));
	assert.ok(handlers.has("session_start"));

	const shortcut = shortcuts.get("shift+alt+enter")!;

	// When idle, triggers continue
	const idleCtx = {
		isIdle: () => true,
		hasPendingMessages: () => false,
	};
	shortcut.handler(idleCtx);
	assert.deepEqual(sentMessages, ["continue"]);

	// When busy, does nothing
	const busyCtx = {
		isIdle: () => false,
		hasPendingMessages: () => false,
	};
	shortcut.handler(busyCtx);
	assert.equal(sentMessages.length, 1);
});

test("continue extension intercepts tmux sequences on terminal input", () => {
	const shortcuts = new Map<string, MockShortcut>();
	const handlers = new Map<string, (event: any, ctx: any) => void>();
	const sentMessages: string[] = [];

	const mockPi: any = {
		registerShortcut(key: string, options: MockShortcut) {
			shortcuts.set(key, options);
		},
		on(event: string, handler: (event: any, ctx: any) => void) {
			handlers.set(event, handler);
		},
		sendUserMessage(msg: string) {
			sentMessages.push(msg);
		},
	};

	continueExtension(mockPi);

	let terminalInputListener: ((data: string) => { consume?: boolean } | undefined) | undefined;

	let editorText = "";
	let idle = true;

	const mockCtx: any = {
		hasUI: true,
		ui: {
			onTerminalInput(listener: any) {
				terminalInputListener = listener;
				return () => {};
			},
			getEditorText: () => editorText,
		},
		isIdle: () => idle,
		hasPendingMessages: () => false,
	};

	// Start session
	handlers.get("session_start")!({}, mockCtx);
	assert.ok(terminalInputListener, "terminal input listener registered");

	// Test \x1b\n (Meta+Shift+Enter in tmux)
	const res1 = terminalInputListener!("\x1b\n");
	assert.deepEqual(res1, { consume: true });
	assert.equal(sentMessages.length, 1);
	assert.equal(sentMessages[0], "continue");

	// Test \x1b\x1b[13;2u
	// Add delay for debounce
	sentMessages.length = 0;
	// Advance time or test when debounced vs not debounced
	const res2 = terminalInputListener!("\x1b\x1b[13;2u");
	// Debounced since < 500ms, but should consume
	assert.deepEqual(res2, { consume: true });

	// Non-matching input passes through
	const res3 = terminalInputListener!("a");
	assert.equal(res3, undefined);
});

test("TMUX_SHIFT_ALT_ENTER_SEQUENCES contains all expected escape sequences", () => {
	assert.ok(TMUX_SHIFT_ALT_ENTER_SEQUENCES.has("\x1b\n"));
	assert.ok(TMUX_SHIFT_ALT_ENTER_SEQUENCES.has("\x1b\x1b[13;2u"));
	assert.ok(TMUX_SHIFT_ALT_ENTER_SEQUENCES.has("\x1b\x1b[27;2;13~"));
	assert.ok(TMUX_SHIFT_ALT_ENTER_SEQUENCES.has("\x1b\x1bOM"));
	assert.ok(TMUX_SHIFT_ALT_ENTER_SEQUENCES.has("\x1b[13;4u"));
	assert.ok(TMUX_SHIFT_ALT_ENTER_SEQUENCES.has("\x1b[13;4:1u"));
	assert.ok(TMUX_SHIFT_ALT_ENTER_SEQUENCES.has("\x1b[27;4;13~"));
});
