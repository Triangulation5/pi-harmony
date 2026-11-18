import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { getUserSettingsPath } from "./settings-path.ts";

/**
 * Shared, stale-while-revalidate reader for the merged project + user settings.
 *
 * - The very first read (cold cache) is synchronous so startup decisions are exact.
 * - After that every read returns the cached value immediately. When the value is
 *   older than STALE_AFTER_MS a single de-duplicated *async* refresh is started, so
 *   render and spinner hot paths never block on file I/O again.
 * - Writers call `invalidateSettings()` so their own edits are visible on the very
 *   next read (that one read is synchronous, and rare).
 */
export type MergedSettings = Record<string, any>;

const STALE_AFTER_MS = 1_000;

let cache: { value: MergedSettings; at: number; key: string } | null = null;
let generation = 0;
let refreshing = false;

function settingsPaths(): string[] {
	return [`${process.cwd()}/.pi/settings.json`, getUserSettingsPath()];
}

function mergeInto(target: MergedSettings, text: string): void {
	try {
		const raw = JSON.parse(text);
		if (raw && typeof raw === "object") Object.assign(target, raw);
	} catch {
		// ignore invalid settings files
	}
}

function readSettingsSync(paths: string[]): MergedSettings {
	const merged: MergedSettings = {};
	for (const path of paths) {
		if (!path) continue;
		try {
			mergeInto(merged, readFileSync(path, "utf8"));
		} catch {
			// missing file: nothing to merge
		}
	}
	return merged;
}

async function readSettingsAsync(paths: string[]): Promise<MergedSettings> {
	const texts = await Promise.all(paths.map((path) => (path ? readFile(path, "utf8").catch(() => "") : "")));
	const merged: MergedSettings = {};
	for (const text of texts) if (text) mergeInto(merged, text);
	return merged;
}

function refreshInBackground(key: string, paths: string[]): void {
	if (refreshing) return;
	refreshing = true;
	const startedGeneration = generation;
	readSettingsAsync(paths)
		.then((value) => {
			// A write/invalidate that happened mid-flight wins over this older read.
			if (startedGeneration === generation) cache = { value, at: Date.now(), key };
		})
		.catch(() => {})
		.finally(() => {
			refreshing = false;
		});
}

export function readMergedSettings(): MergedSettings {
	const paths = settingsPaths();
	const key = paths.join("\0");
	if (cache && cache.key === key) {
		if (Date.now() - cache.at >= STALE_AFTER_MS) refreshInBackground(key, paths);
		return cache.value;
	}
	const value = readSettingsSync(paths);
	cache = { value, at: Date.now(), key };
	return value;
}

/** Drop the cache so the next read is fresh. Call after writing a settings file. */
export function invalidateSettings(): void {
	generation++;
	cache = null;
}
