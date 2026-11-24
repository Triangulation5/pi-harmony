import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { UserMessageComponent, initTheme } from "@earendil-works/pi-coding-agent";
import initTools from "../../extensions/index.ts";

test("package.json pi.extensions uses TypeScript entrypoints for jiti module aliasing", () => {
	const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
	const extensions: string[] = pkg?.pi?.extensions ?? [];
	assert.ok(extensions.length > 0);
	for (const entry of extensions) {
		assert.ok(entry.endsWith(".ts"), `expected .ts entrypoint so pi uses jiti aliases, got ${entry}`);
	}
});

test("UserMessageComponent renders prompt marker and background band after extension init", async () => {
	initTheme("dark");
	const fakePi: any = {
		on() {},
		registerTool() {},
		registerCommand() {},
		registerShortcut() {},
		registerMessageRenderer() {},
		getCommands() {
			return [];
		},
		events: { on() {}, emit() {} },
	};
	await initTools(fakePi);

	const component = new UserMessageComponent("hello world");
	const lines = component.render(40);
	assert.ok(lines.length > 0);
	assert.ok(lines.some((line) => line.includes("❯")), "expected ❯ prompt marker in rendered user prompt");
	assert.ok(lines.some((line) => /\x1b\[48;2;\d+;\d+;\d+m/.test(line)), "expected RGB background band on user prompt");
});
