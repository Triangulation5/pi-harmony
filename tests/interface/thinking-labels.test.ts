import assert from "node:assert/strict";
import test from "node:test";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createThinkingLabels } from "../../extensions/terminal/messages/thinking-labels.ts";

test("thinking labels track completed assistant work without changing message content", async () => {
	const handlers = new Map<string, (event?: any, ctx?: any) => unknown>();
	const pi = {
		on(event: string, handler: (event?: any, ctx?: any) => unknown) {
			handlers.set(event, handler);
		},
	} as unknown as ExtensionAPI;
	const labels = createThinkingLabels({ applyThemePaletteIfNeeded: () => {} });
	labels.register(pi);

	const message = { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" };
	await handlers.get("before_agent_start")?.();
	await handlers.get("message_start")?.({ message });
	await handlers.get("message_end")?.({ message }, { ui: { invalidate() {}, requestRender() {} } });

	assert.equal(message.content[0].text, "done");
	assert.equal(typeof labels.workedDurationByMessage.get(message)?.duration, "number");
	assert.equal(labels.isAgentWorkActive(), true);

	await handlers.get("agent_end")?.();
	assert.equal(labels.isAgentWorkActive(), false);
});
