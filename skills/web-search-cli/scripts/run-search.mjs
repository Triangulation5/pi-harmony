import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

export function pythonCandidates(platform = process.platform) {
	if (platform === "win32") {
		return [
			{ command: "py", args: ["-3"] },
			{ command: "python", args: [] },
			{ command: "python3", args: [] },
		];
	}
	return [
		{ command: "python3", args: [] },
		{ command: "python", args: [] },
	];
}

export function runSearch(args = process.argv.slice(2)) {
	const script = join(dirname(fileURLToPath(import.meta.url)), "search.py");
	for (const candidate of pythonCandidates()) {
		const result = spawnSync(candidate.command, [...candidate.args, script, ...args], {
			stdio: "inherit",
			windowsHide: true,
		});
		if (result.error?.code === "ENOENT") continue;
		if (result.error) {
			console.error(`Could not start ${candidate.command}: ${result.error.message}`);
			return 1;
		}
		return result.status ?? 1;
	}

	const command = process.platform === "win32" ? "`py -3` or `python`" : "`python3` or `python`";
	console.error(`Python 3 was not found. Install Python 3 and ensure ${command} is available on PATH.`);
	return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = runSearch();
}
