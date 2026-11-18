import assert from "node:assert/strict";
import { test } from "node:test";
import { Container } from "@earendil-works/pi-tui";
import { __headerToggleInternals } from "../extensions/index.ts";

const {
	headerDetailsEnabled,
	setHeaderDetailsOverride,
	isResourceSectionLine,
	isLoadedResourcesContainer,
	handleHeaderCommand,
	initContainerPatches,
	LOADED_RESOURCES_CONTAINER_FLAG,
} = __headerToggleInternals;

initContainerPatches();

class MockSection {
	title: string;
	body: string;
	constructor(title: string, body: string) {
		this.title = title;
		this.body = body;
	}
	render(_width: number): string[] {
		return [this.title, `  ${this.body}`];
	}
}

test("isResourceSectionLine recognizes header sections", () => {
	assert.equal(isResourceSectionLine("[Skills]"), true);
	assert.equal(isResourceSectionLine("\x1b[35m[Skills]\x1b[39m"), true);
	assert.equal(isResourceSectionLine("[Prompts]"), true);
	assert.equal(isResourceSectionLine("[Extensions]"), true);
	assert.equal(isResourceSectionLine("[Context]"), true);
	assert.equal(isResourceSectionLine("[Skill warnings]"), true);
	assert.equal(isResourceSectionLine("Regular text"), false);
	assert.equal(isResourceSectionLine("Read 2 files"), false);
});

test("isLoadedResourcesContainer identifies container with resource sections", () => {
	const normalContainer = new Container();
	normalContainer.addChild(new MockSection("Some title", "Some content"));
	assert.equal(isLoadedResourcesContainer(normalContainer), false);

	const resourcesContainer = new Container();
	resourcesContainer.addChild(new MockSection("[Skills]", "commit, web-search-cli"));
	resourcesContainer.addChild(new MockSection("[Prompts]", "/council, /review-loop"));
	resourcesContainer.addChild(new MockSection("[Extensions]", "spinner.ts, extensions"));
	assert.equal(isLoadedResourcesContainer(resourcesContainer), true);
	assert.equal((resourcesContainer as any)[LOADED_RESOURCES_CONTAINER_FLAG], true);
});

test("loadedResourcesContainer renders empty lines when header details are disabled", () => {
	const resourcesContainer = new Container();
	resourcesContainer.addChild(new MockSection("[Skills]", "commit, web-search-cli"));
	resourcesContainer.addChild(new MockSection("[Prompts]", "/council, /review-loop"));
	resourcesContainer.addChild(new MockSection("[Extensions]", "spinner.ts, extensions"));

	// Enabled: renders children
	setHeaderDetailsOverride(true);
	const renderedOn = resourcesContainer.render(80);
	assert.ok(renderedOn.length > 0);
	assert.ok(renderedOn.some((line) => line.includes("[Skills]")));

	// Disabled: renders 0 lines
	setHeaderDetailsOverride(false);
	const renderedOff = resourcesContainer.render(80);
	assert.equal(renderedOff.length, 0);

	// Reset
	setHeaderDetailsOverride(null);
});

test("handleHeaderCommand toggles and updates UI", async () => {
	setHeaderDetailsOverride(null);
	const notifications: Array<{ msg: string; type: string }> = [];
	let rendersRequested = 0;
	const mockCtx = {
		hasUI: true,
		ui: {
			notify: (msg: string, type: string) => {
				notifications.push({ msg, type });
			},
			invalidate: () => {},
			requestRender: () => {
				rendersRequested++;
			},
		},
	};

	// Explicit off
	await handleHeaderCommand("off", mockCtx);
	assert.equal(headerDetailsEnabled(), false);
	assert.ok(notifications[notifications.length - 1].msg.includes("Header details: off"));

	// Toggle (off -> on)
	await handleHeaderCommand("toggle", mockCtx);
	assert.equal(headerDetailsEnabled(), true);
	assert.ok(notifications[notifications.length - 1].msg.includes("Header details: on"));

	// Bare toggle (on -> off)
	await handleHeaderCommand("", mockCtx);
	assert.equal(headerDetailsEnabled(), false);
	assert.ok(notifications[notifications.length - 1].msg.includes("Header details: off"));

	// Status (doesn't change value)
	await handleHeaderCommand("status", mockCtx);
	assert.equal(headerDetailsEnabled(), false);
	assert.ok(notifications[notifications.length - 1].msg.includes("Header details: off"));

	// Explicit on
	await handleHeaderCommand("on", mockCtx);
	assert.equal(headerDetailsEnabled(), true);
	assert.ok(notifications[notifications.length - 1].msg.includes("Header details: on"));

	assert.ok(rendersRequested > 0);
	setHeaderDetailsOverride(null);
});
