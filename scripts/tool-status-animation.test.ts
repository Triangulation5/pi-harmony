import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { __toolStatusAnimationInternals } from "../extensions/index.ts";
import { invalidateSettings } from "../extensions/settings-store.ts";

const { toolStatusAnimation, handleToolActivityCommand } = __toolStatusAnimationInternals;

test("tool activity command persists the selected animation and reports status", () => {
	const originalCwd = process.cwd();
	const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
	const dir = mkdtempSync(join(tmpdir(), "pi-harmony-tool-activity-"));
	const notifications: Array<{ message: string; type: string }> = [];
	let renders = 0;
	const ctx = {
		hasUI: true,
		ui: {
			notify: (message: string, type: string) => notifications.push({ message, type }),
			requestRender: () => { renders++; },
		},
	};

	try {
		process.chdir(dir);
		process.env.PI_CODING_AGENT_DIR = join(dir, "agent");
		invalidateSettings();
		assert.equal(toolStatusAnimation(), "breathe");

		handleToolActivityCommand("blink", ctx);
		assert.equal(toolStatusAnimation(), "blink");
		assert.equal(
			JSON.parse(readFileSync(join(dir, "agent", "settings.json"), "utf8")).toolStatusAnimation,
			"blink",
		);
		assert.match(notifications.at(-1)?.message ?? "", /Tool activity: blink/);
		assert.equal(renders, 1);

		handleToolActivityCommand("status", ctx);
		assert.match(notifications.at(-1)?.message ?? "", /Tool activity: blink/);
		assert.equal(renders, 1);

		handleToolActivityCommand("invalid", ctx);
		assert.equal(notifications.at(-1)?.type, "error");
		assert.equal(toolStatusAnimation(), "blink");
	} finally {
		process.chdir(originalCwd);
		if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
		rmSync(dir, { recursive: true, force: true });
		invalidateSettings();
	}
});
