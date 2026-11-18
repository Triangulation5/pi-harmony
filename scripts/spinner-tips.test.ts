import assert from "node:assert/strict";
import test from "node:test";

import { Loader } from "@earendil-works/pi-tui";
import {
	DEFAULT_SPINNER_TIPS,
	formatTipLine,
	getActionShortcut,
	getAvailableTips,
	getKeybindTips,
	pickRandomTip,
	shouldShowSpinnerTip,
	SPINNER_TIP_MIN_ELAPSED_MS,
	SPINNER_TIP_OCCASIONAL_CHANCE,
} from "../extensions/spinner.ts";

test("DEFAULT_SPINNER_TIPS includes keybinds, subagents, context, commands, and skills", () => {
	assert.ok(DEFAULT_SPINNER_TIPS.length >= 10);
	const allTips = DEFAULT_SPINNER_TIPS.join(" ");

	// Keybinds (including Ctrl+G requested by user)
	assert.ok(allTips.includes("Ctrl+G"), "Should include tip about Ctrl+G");
	assert.ok(allTips.includes("Ctrl+O"), "Should include tip about Ctrl+O");
	assert.ok(allTips.includes("/hotkeys"), "Should include tip about /hotkeys");
	assert.ok(!allTips.includes("clear your terminal screen and scrollback"), "Inaccurate Ctrl+L clear tip should be removed");
	assert.ok(allTips.includes("model selector"), "Ctrl+L should refer to model selector");

	// Subagents
	assert.ok(allTips.toLowerCase().includes("subagent"), "Should include tip about subagents");

	// Context
	assert.ok(allTips.includes("@filename") || allTips.includes("/compact"), "Should include tip about context");

	// Commands
	assert.ok(allTips.includes("/tools") || allTips.includes("/spinner"), "Should include tip about commands");

	// Skills
	assert.ok(allTips.includes("web-search-cli") || allTips.includes("ask_user_question"), "Should include tip about skills");
});

test("getActionShortcut and getKeybindTips resolve accurate shortcuts", () => {
	assert.equal(getActionShortcut("app.editor.external"), "Ctrl+G");
	assert.equal(getActionShortcut("app.tools.expand"), "Ctrl+O");
	assert.equal(getActionShortcut("app.interrupt"), "Escape");
	assert.equal(getActionShortcut("app.model.select"), "Ctrl+L");
	assert.equal(getActionShortcut("tui.input.newLine"), "Shift+Enter");

	const keybindTips = getKeybindTips();
	assert.ok(keybindTips.some((t) => t.includes("/hotkeys")));
	assert.ok(keybindTips.some((t) => t.includes("Ctrl+G")));
	assert.ok(keybindTips.some((t) => t.includes("Ctrl+O")));
	assert.ok(keybindTips.some((t) => t.includes("model selector")));
});

test("formatTipLine produces aligned connector format", () => {
	const line = formatTipLine("Press Ctrl+G to edit prompt", "", "");
	assert.equal(line, "  └ Tip: Press Ctrl+G to edit prompt");
});

test("getAvailableTips includes dynamic skills and prompt templates", () => {
	const mockPi: any = {
		getCommands: () => [
			{ name: "skill:pdf-reader", description: "Read PDF files", source: "skill" },
			{ name: "council", description: "Run multi-model council", source: "prompt" },
		],
	};

	const tips = getAvailableTips(mockPi);
	assert.ok(tips.some((t) => t.includes("skill:pdf-reader")));
	assert.ok(tips.some((t) => t.includes("council")));
});

test("pickRandomTip respects exclude filter when possible", () => {
	const exclude = DEFAULT_SPINNER_TIPS[0];
	for (let i = 0; i < 20; i++) {
		const tip = pickRandomTip(exclude);
		assert.notEqual(tip, exclude);
	}
});

test("Loader renders spinner text with aligned tip underneath", () => {
	const tip = "Press Ctrl+G to edit prompt in external editor";
	const workingMessage = `Sprouting (thinking with medium effort · ↓ 46 tokens · 1s)\n${formatTipLine(tip, "", "")}`;
	const loader = new Loader(null as any, (s) => s, (s) => s, workingMessage, { frames: ["✻"] });
	loader.start();
	const lines = loader.render(90);

	// Line 0 is empty header from Loader
	// Line 1 should have spinner glyph and verb
	// Line 2 should have 3 leading spaces and └ Tip:
	assert.ok(lines.length >= 3);
	assert.match(lines[1], /^\s\S\sSprouting/);
	assert.match(lines[2], /^\s{3}└\sTip:\sPress Ctrl\+G/);
});

test("/spinner tips is registered with completions and status reporting", async () => {
	let registeredSpinnerCommand: any;
	let registeredToolsCommand: any;
	const mockPi: any = {
		on: () => () => {},
		registerCommand: (name: string, cmd: any) => {
			if (name === "spinner") registeredSpinnerCommand = cmd;
			if (name === "tools") registeredToolsCommand = cmd;
		},
		registerShortcut: () => {},
		registerFlag: () => {},
		getFlag: () => undefined,
		registerMessageRenderer: () => {},
		registerMarkdownTransformer: () => {},
		registerEntryRenderer: () => {},
		registerToolRenderer: () => {},
		registerTool: () => {},
		getCommands: () => [],
	};

	const { default: initTools } = await import("../extensions/index.ts");
	initTools(mockPi);
	assert.ok(registeredSpinnerCommand, "/spinner command should be registered");

	// /tools should not have tips subcommand
	const toolsCompletions = registeredToolsCommand.getArgumentCompletions("tip");
	assert.equal(toolsCompletions.length, 0, "/tools should not have tips subcommand");

	const rootCompletions = registeredSpinnerCommand.getArgumentCompletions("tip");
	assert.ok(rootCompletions.some((c: any) => c.value === "tips"));

	const completions = registeredSpinnerCommand.getArgumentCompletions("tips ");
	assert.ok(completions.some((c: any) => c.value === "tips on"));
	assert.ok(completions.some((c: any) => c.value === "tips off"));
	assert.ok(completions.some((c: any) => c.value === "tips toggle"));
	assert.ok(completions.some((c: any) => c.value === "tips status"));

	const notifications: string[] = [];
	const mockCtx = {
		hasUI: true,
		ui: {
			notify: (msg: string) => notifications.push(msg),
			theme: { appearance: "dark" },
		},
	};

	await registeredSpinnerCommand.handler("tips status", mockCtx);
	assert.ok(notifications.length > 0);
	assert.match(notifications[notifications.length - 1], /Spinner tips:\s+(?:on|off)/);
});

test("shouldShowSpinnerTip only shows after agent has been working for a while and only when eligible", () => {
	assert.ok(SPINNER_TIP_MIN_ELAPSED_MS >= 5_000, "Threshold should be at least 5s to avoid instant display");
	assert.ok(SPINNER_TIP_OCCASIONAL_CHANCE > 0 && SPINNER_TIP_OCCASIONAL_CHANCE < 0.6, "Occasional chance should be reasonable");

	// Instant start (0s): never show
	assert.equal(
		shouldShowSpinnerTip({ tipsEnabled: true, elapsedMs: 0, isEligible: true }),
		false,
		"Should not show instantly",
	);

	// Short turn (3s): still working briefly, not for a while yet
	assert.equal(
		shouldShowSpinnerTip({ tipsEnabled: true, elapsedMs: 3_000, isEligible: true }),
		false,
		"Should not show during short turns",
	);

	// Talking for a while (>= SPINNER_TIP_MIN_ELAPSED_MS), eligible: show tip
	assert.equal(
		shouldShowSpinnerTip({ tipsEnabled: true, elapsedMs: SPINNER_TIP_MIN_ELAPSED_MS, isEligible: true }),
		true,
		"Should show after working for a while when eligible",
	);

	// Talking for a while, but this turn was not occasionally selected: do not show
	assert.equal(
		shouldShowSpinnerTip({ tipsEnabled: true, elapsedMs: SPINNER_TIP_MIN_ELAPSED_MS + 5_000, isEligible: false }),
		false,
		"Should not show if turn is not occasionally selected",
	);

	// Tips disabled via settings (/tools tips off): do not show
	assert.equal(
		shouldShowSpinnerTip({ tipsEnabled: false, elapsedMs: 30_000, isEligible: true }),
		false,
		"Should never show when tips are toggled off",
	);
});
