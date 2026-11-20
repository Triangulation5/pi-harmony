import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { invalidateSettings, readMergedSettings } from "../../extensions/settings/store.ts";

function writeProjectSettings(dir: string, settings: Record<string, unknown>): void {
	mkdirSync(join(dir, ".pi"), { recursive: true });
	writeFileSync(join(dir, ".pi", "settings.json"), JSON.stringify(settings));
}

test("settings store reads cold synchronously, then revalidates in the background", async () => {
	const originalCwd = process.cwd();
	const dir = mkdtempSync(join(tmpdir(), "pi-harmony-settings-"));
	try {
		process.chdir(dir);
		writeProjectSettings(dir, { spinnerTips: true });
		invalidateSettings();

		assert.equal(readMergedSettings().spinnerTips, true, "cold read is exact and synchronous");

		writeProjectSettings(dir, { spinnerTips: false });
		assert.equal(readMergedSettings().spinnerTips, true, "fresh cache is served without touching disk");

		await new Promise((resolve) => setTimeout(resolve, 1_100));
		assert.equal(readMergedSettings().spinnerTips, true, "a stale read still returns instantly (stale-while-revalidate)");

		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(readMergedSettings().spinnerTips, false, "the background refresh landed");
	} finally {
		process.chdir(originalCwd);
		rmSync(dir, { recursive: true, force: true });
		invalidateSettings();
	}
});

test("invalidateSettings makes the next read fresh", () => {
	const originalCwd = process.cwd();
	const dir = mkdtempSync(join(tmpdir(), "pi-harmony-settings-"));
	try {
		process.chdir(dir);
		writeProjectSettings(dir, { toolBackground: "transparent" });
		invalidateSettings();
		assert.equal(readMergedSettings().toolBackground, "transparent");

		writeProjectSettings(dir, { toolBackground: "outlines" });
		invalidateSettings();
		assert.equal(readMergedSettings().toolBackground, "outlines", "writers see their own edit immediately");
	} finally {
		process.chdir(originalCwd);
		rmSync(dir, { recursive: true, force: true });
		invalidateSettings();
	}
});
