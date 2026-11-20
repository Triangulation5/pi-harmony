import assert from "node:assert/strict";
import test from "node:test";

import { pythonCandidates } from "../../skills/web-search-cli/scripts/run-search.mjs";

test("web-search launcher checks the Windows Python launcher first", () => {
	assert.deepEqual(pythonCandidates("win32"), [
		{ command: "py", args: ["-3"] },
		{ command: "python", args: [] },
		{ command: "python3", args: [] },
	]);
});

test("web-search launcher prefers python3 on Unix-like systems", () => {
	assert.deepEqual(pythonCandidates("linux"), [
		{ command: "python3", args: [] },
		{ command: "python", args: [] },
	]);
	assert.deepEqual(pythonCandidates("darwin"), [
		{ command: "python3", args: [] },
		{ command: "python", args: [] },
	]);
});
