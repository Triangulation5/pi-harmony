import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	configureLocalIntents,
	localIntentBackend,
	localIntentFor,
	requestLocalIntent,
	resetLocalIntentsForTests,
	watchLocalIntent,
} from "../../extensions/bash/intent.ts";

test("local intent selects Apple native only on supported Apple silicon Macs", () => {
	assert.equal(localIntentBackend("darwin", "arm64", "25.0.0"), "apple");
	assert.equal(localIntentBackend("darwin", "arm64", "24.6.0"), "compatible");
	assert.equal(localIntentBackend("darwin", "x64", "25.0.0"), "compatible");
	assert.equal(localIntentBackend("linux", "arm64", "6.1"), "compatible");
	assert.equal(localIntentBackend("win32", "x64", "10.0"), "compatible");
});

test("local intent requests labels from an OpenAI-compatible local API", async () => {
	const previousEnv = {
		baseUrl: process.env.PI_CC_UI_INTENT_BASE_URL,
		model: process.env.PI_CC_UI_INTENT_MODEL,
		apiKey: process.env.PI_CC_UI_INTENT_API_KEY,
		cacheDir: process.env.PI_CC_UI_CACHE_DIR,
	};
	const cache = mkdtempSync(join(tmpdir(), "pi-harmony-intent-"));
	let requestedModel = "";
	let requestedAuth = "";
	let serverError: Error | undefined;
	const server = createServer(async (request, response) => {
		if (request.url === "/v1/models") {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ data: [{ id: "local-test-model" }] }));
			return;
		}
		if (request.url !== "/v1/chat/completions" || request.method !== "POST") {
			serverError = new Error(`unexpected request: ${request.method} ${request.url}`);
			response.writeHead(404).end();
			return;
		}
		let body = "";
		for await (const chunk of request) body += chunk;
		const parsed = JSON.parse(body);
		requestedModel = parsed.model;
		requestedAuth = request.headers.authorization ?? "";
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({ choices: [{ message: { content: "Show working tree changes" } }] }));
	});

	try {
		process.env.PI_CC_UI_CACHE_DIR = cache;
		process.env.PI_CC_UI_INTENT_MODEL = "";
		process.env.PI_CC_UI_INTENT_API_KEY = "local-test-key";
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		process.env.PI_CC_UI_INTENT_BASE_URL = `http://127.0.0.1:${address.port}/v1`;

		const command = "git status --short";
		const labelPromise = new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("timed out waiting for local label")), 5_000);
			const rejectLabel = (message: string): void => {
				clearTimeout(timer);
				reject(new Error(message));
			};
			configureLocalIntents(true, rejectLabel);
			watchLocalIntent(command, () => {
				clearTimeout(timer);
				resolve(localIntentFor(command) ?? "");
			});
			requestLocalIntent(command);
		});

		assert.equal(await labelPromise, "Show working tree changes");
		assert.equal(requestedModel, "local-test-model");
		assert.equal(requestedAuth, "Bearer local-test-key");
		assert.equal(serverError, undefined);
	} finally {
		configureLocalIntents(false);
		resetLocalIntentsForTests();
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		rmSync(cache, { recursive: true, force: true });
		for (const [key, value] of Object.entries({
			PI_CC_UI_INTENT_BASE_URL: previousEnv.baseUrl,
			PI_CC_UI_INTENT_MODEL: previousEnv.model,
			PI_CC_UI_INTENT_API_KEY: previousEnv.apiKey,
			PI_CC_UI_CACHE_DIR: previousEnv.cacheDir,
		})) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
});
