import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

/**
 * Checks whether the current process is running inside tmux or a tmux/screen-like multiplexer.
 */
export function isTmuxSession(): boolean {
	return Boolean(
		process.env.TMUX ||
		process.env.TERM?.startsWith("tmux") ||
		process.env.TERM?.startsWith("screen")
	);
}

/**
 * Known sequences that represent Shift+Alt+Enter in tmux and legacy/VT terminals:
 * - \x1b\n: Tmux Meta+Shift+Enter / Meta+LF (often parsed by Pi as ctrl+alt+j)
 * - \x1b\x1b[13;2u: ESC prefix + CSI u Shift+Enter
 * - \x1b\x1b[27;2;13~: ESC prefix + modifyOtherKeys Shift+Enter
 * - \x1b\x1bOM: ESC prefix + SS3 M (keypad Enter)
 * - \x1b[13;4u: CSI u Shift+Alt+Enter
 * - \x1b[13;4:1u: CSI u Shift+Alt+Enter (press event)
 * - \x1b[27;4;13~: xterm modifyOtherKeys Shift+Alt+Enter
 */
export const TMUX_SHIFT_ALT_ENTER_SEQUENCES = new Set([
	"\x1b\n",
	"\x1b\x1b[13;2u",
	"\x1b\x1b[27;2;13~",
	"\x1b\x1bOM",
	"\x1b[13;4u",
	"\x1b[13;4:1u",
	"\x1b[27;4;13~",
]);

/** Send a literal continuation prompt, but never steer or queue one mid-run. */
export default function (pi: ExtensionAPI) {
	let lastContinueTime = 0;

	const tryTriggerContinue = (ctx: ExtensionContext): boolean => {
		const now = Date.now();
		if (now - lastContinueTime < 500) return false;
		if (!ctx.isIdle()) return false;
		if (ctx.hasPendingMessages?.()) return false;

		lastContinueTime = now;
		pi.sendUserMessage("continue");
		return true;
	};

	// Canonical shortcut registration (listed in /hotkeys and works outside tmux)
	pi.registerShortcut("shift+alt+enter", {
		description: 'Send "continue" when the agent is stopped',
		handler: (ctx) => {
			tryTriggerContinue(ctx);
		},
	});

	// Hook raw terminal input to handle tmux translation quirks where Shift+Alt+Enter
	// is emitted as \x1b\n, \x1b\x1b[13;2u, or collapsed to \x1b\r when idle with an empty editor.
	pi.on("session_start", (_event, ctx) => {
		const isTmux = isTmuxSession();

		// Prompt tmux to forward extended key combinations (CSI-u / modifyOtherKeys)
		if (isTmux && process.stdout.isTTY) {
			try {
				process.stdout.write("\x1b[>4;2m");
			} catch {}
		}

		if (!ctx.hasUI || !ctx.ui?.onTerminalInput) return;

		ctx.ui.onTerminalInput((data) => {
			const isExplicitShiftAltEnter =
				matchesKey(data, "shift+alt+enter") ||
				matchesKey(data, "alt+shift+enter") ||
				TMUX_SHIFT_ALT_ENTER_SEQUENCES.has(data);

			if (isExplicitShiftAltEnter) {
				if (tryTriggerContinue(ctx)) {
					return { consume: true };
				}
				// When not idle, consume the sequence so it does not leak raw bytes into the editor
				return { consume: true };
			}

			// In tmux environments where tmux strips Shift and sends \x1b\r (Alt+Enter):
			// If agent is idle, has no pending messages, and the editor is empty,
			// treat as continue. If editor has text, let it pass through to app.message.followUp.
			if (isTmux && data === "\x1b\r") {
				const editorText = ctx.ui.getEditorText?.() ?? "";
				if (editorText.trim() === "" && ctx.isIdle() && !ctx.hasPendingMessages?.()) {
					if (tryTriggerContinue(ctx)) {
						return { consume: true };
					}
				}
			}

			return undefined;
		});
	});
}
