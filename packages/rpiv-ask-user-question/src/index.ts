/**
 * rpiv-ask-user-question — Pi extension. Registers the `ask_user_question`
 * tool: a structured option selector with an automatically appended
 * `Type something.` custom-answer row.
 *
 * Sentinel labels and TUI chrome strings localize at render time via the i18n
 * bridge. Strings are registered with rpiv-i18n here, once, at module init —
 * but only when the SDK is actually installed. If `@juicesharp/rpiv-i18n` is
 * missing (standalone install of just this package), the dynamic-load shim
 * no-ops and the bridge's `t(key, fallback)` returns the inline English literal
 * at every call site. The extension stays online either way.
 *
 * Adding a locale: drop `locales/<code>.json` next to en.json (mirroring the
 * key set). No edit needed here — `registerLocalesFromDir` iterates
 * `SUPPORTED_LOCALES` from the SDK. See `@juicesharp/rpiv-i18n` README →
 * "Contributing translations" for the full convention.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAskUserQuestionTool } from "./ask-user-question.ts";
import { registerAskUserQuestionReconciler } from "./reconcile.ts";
import { activateI18nScope, I18N_NAMESPACE } from "./state/i18n-bridge.ts";

type I18nLoader = {
	registerLocalesFromDir: (namespace: string, packageUrl: string, options?: { label?: string }) => void;
};

// Dynamic import keeps `@juicesharp/rpiv-i18n` a soft optional peer: when the
// SDK is installed alongside this package the strings register and
// `/languages` flips them live; when it isn't, the import rejects here, we
// no-op, and the bridge's English-fallback shim keeps the extension online.
//
// The `/loader` subpath is used instead of the SDK entry so the i18n-ui +
// pi-tui modules are not pulled into our load graph just to register strings.
//
// Registration is deferred off the load path (no top-level await): the bridge already
// falls back to English until the locales land, and `/languages` flips them live, so
// the tool is registered immediately while the SDK loads in the background.
const i18nPackageUrl = new URL("..", import.meta.url).href;
function registerLocalesInBackground(): void {
	setImmediate(() => {
		import("@juicesharp/rpiv-i18n/loader")
			.then((sdk) => (sdk as I18nLoader).registerLocalesFromDir(I18N_NAMESPACE, i18nPackageUrl, { label: "rpiv-ask-user-question" }))
			.catch(() => {
				// SDK absent — extension still loads with English-only UI.
			})
			// Locales first, then bind `t` to the live scope.
			.then(() => activateI18nScope());
	});
}

export {
	ASK_USER_ANSWER_EVENT,
	ASK_USER_ANSWER_RESULT_EVENT,
	ASK_USER_BLOCKED_EVENT,
	ASK_USER_PROMPT_EVENT,
	type AskUserAnswerEntry,
	type AskUserAnswerEventPayload,
	type AskUserAnswerRejectCode,
	type AskUserAnswerResultEventPayload,
	type AskUserBlockedEventPayload,
	type AskUserPromptEventPayload,
	type AskUserPromptOption,
	type AskUserPromptQuestion,
} from "./events.ts";

export default function (pi: ExtensionAPI) {
	registerLocalesInBackground();
	registerAskUserQuestionTool(pi);
	registerAskUserQuestionReconciler(pi);
}
