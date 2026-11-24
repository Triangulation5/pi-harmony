import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { registerToolsCommand } from "../../extensions/commands/tools.ts";
import { shouldUseGenericToolRenderer } from "../../extensions/terminal/tool-renderers/tool-names.ts";

test("custom-rendered bundled tools are not overridden by generic tool renderer", () => {
	assert.equal(shouldUseGenericToolRenderer("todo"), false);
	assert.equal(shouldUseGenericToolRenderer("ask_user_question"), false);
	assert.equal(shouldUseGenericToolRenderer("web_search"), true);
});

test("/tools todo does not touch ctx after ctx.reload() invalidates it", async () => {
	let commandHandler: ((args: string, ctx: any) => Promise<void>) | undefined;
	const fakePi: any = {
		registerCommand(name: string, def: any) {
			if (name === "tools") commandHandler = def.handler;
		},
	};
	let todoEnabled = false;
	registerToolsCommand(fakePi, {
		readSettings: () => ({ todoEnabled }),
		readMergedSettings: () => ({ todoEnabled }),
		writeSettingsKey: (_k, v) => { todoEnabled = Boolean(v); },
		rawKeyHint: () => "",
		headerDetailsEnabled: () => true,
		setHeaderDetailsOverride: () => {},
		getKnownLoadedResourcesContainer: () => null,
		toolGroupingEnabled: () => true,
		setToolGroupingEnabled: () => {},
		ungroupActiveToolGroups: () => {},
		toolStatusAnimation: () => "breathe",
		handleToolActivityCommand: () => {},
		getThinkingMode: () => "live",
		thinkingLabelEnabled: () => false,
		applyThinkingModeToChats: () => {},
		requestChatRender: () => {},
		getBashIntentMode: () => "model",
		normalizeBashIntentMode: () => "model",
		getExtraToolOutputExpanded: () => false,
		setExtraToolDetailMode: () => {},
		claudeUiEnabled: () => true,
		getToolBackgroundMode: () => "transparent",
		setToolBackgroundMode: () => {},
		setToolBackgroundOverride: () => {},
		applyToolBackgroundMode: () => {},
	});

	assert.ok(commandHandler, "expected /tools command to be registered");

	let reloaded = false;
	const notifications: string[] = [];
	const staleProxy = new Proxy(
		{
			hasUI: true,
			ui: {
				notify(msg: string) {
					if (reloaded) throw new Error("This extension ctx is stale after session replacement or reload.");
					notifications.push(msg);
				},
			},
			async reload() {
				reloaded = true;
			},
		},
		{
			get(target, prop, receiver) {
				if (reloaded && prop !== "then") {
					throw new Error("This extension ctx is stale after session replacement or reload.");
				}
				return Reflect.get(target, prop, receiver);
			},
		},
	);

	await commandHandler!("todo on", staleProxy);
	assert.equal(todoEnabled, true);
	assert.equal(reloaded, true);
	assert.equal(notifications.length, 1);
	assert.match(notifications[0], /Todo extension: on/);
});

test("package.json peerDependencies match actual runtime peer imports", () => {
	const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
	assert.ok(pkg.peerDependencies["@earendil-works/pi-ai"], "expected @earendil-works/pi-ai in peerDependencies");
	assert.equal(pkg.peerDependencies["@sinclair/typebox"], undefined, "unused @sinclair/typebox should not be a peerDependency");
	assert.ok(!pkg.files.includes("extensions/shared/**"), "empty nonexistent extensions/shared/** should not be in files");
});
