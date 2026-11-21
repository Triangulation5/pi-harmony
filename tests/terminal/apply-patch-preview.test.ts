import assert from "node:assert/strict";
import test from "node:test";

import { parseApplyPatchPreview } from "../../extensions/terminal/tools/apply-patch-preview.ts";
import type { ParsedDiff } from "../../extensions/terminal/diff-rendering/types.ts";

const previewDependencies = {
	normalizeToLf: (text: string) => text.replace(/\r\n/g, "\n"),
	parseDiff(before: string, after: string): ParsedDiff {
		const oldLines = before ? before.split("\n") : [];
		const newLines = after ? after.split("\n") : [];
		const lines: ParsedDiff["lines"] = [
			...oldLines.map((content, index) => ({ type: "del" as const, oldNum: index + 1, newNum: null, content })),
			...newLines.map((content, index) => ({ type: "add" as const, oldNum: null, newNum: index + 1, content })),
		];
		return { lines, added: newLines.length, removed: oldLines.length, chars: [...oldLines, ...newLines].join("").length };
	},
	summarizeDiff: (added: number, removed: number) => `+${added} -${removed}`,
	lang: () => undefined,
	getBorderColor: () => "",
	getTransparentReset: () => "",
};

test("apply patch preview parses file changes and aggregates diff counts", () => {
	const preview = parseApplyPatchPreview(
		[
			"*** Begin Patch",
			"*** Add File: added.txt",
			"+one",
			"+two",
			"*** Update File: changed.txt",
			"@@ -2 +2 @@",
			"-before",
			"+after",
			"*** Delete File: removed.txt",
			"-old",
			"*** End Patch",
		].join("\n"),
		(path) => path,
		process.cwd(),
		previewDependencies,
	);

	assert.deepEqual(preview.changes.map(({ kind, path }) => ({ kind, path })), [
		{ kind: "add", path: "added.txt" },
		{ kind: "update", path: "changed.txt" },
		{ kind: "delete", path: "removed.txt" },
	]);
	assert.equal(preview.totalAdded, 3);
	assert.equal(preview.totalRemoved, 2);
	assert.equal(preview.changes[0].diff.lines.filter((line) => line.type === "add").length, 2);
});

test("empty apply patch preview has no changes", () => {
	assert.equal(parseApplyPatchPreview("*** Begin Patch\n*** End Patch", (path) => path, process.cwd(), previewDependencies).changes.length, 0);
});
