/**
 * i18n bridge for rpiv-todo — single thin import surface so every call site
 * routes through one module. Backed by `@juicesharp/rpiv-i18n`'s SDK when
 * available; degrades to canonical-English fallbacks when not.
 *
 * - `t(key, fallback)` is `scope("@juicesharp/rpiv-todo")` if the SDK is
 *   installed (live `/languages` updates propagate). If the SDK is missing
 *   (standalone install without rpiv-i18n), `t` is an identity passthrough
 *   that returns the inline English fallback at every call site, so the
 *   extension stays online with English UI.
 * - `formatStatusLabel(status)` resolves a TaskStatus to its locale-aware
 *   label via the canonical `status.*` namespace, with the English literal
 *   as fallback so nothing renders blank if the namespace isn't registered.
 *   This is the SINGLE point of localization for status words — overlay,
 *   /todos header, /todos render-call all route through here.
 *
 * Strings are registered ONCE at extension load (see ../index.ts). Call sites
 * MUST use this module at render time — never bake the result into a top-level
 * `const X = formatStatusLabel(...)`.
 */

import type { TaskStatus } from "../tool/types.ts";

export const I18N_NAMESPACE = "@juicesharp/rpiv-todo";

type ScopeFn = (key: string, fallback: string) => string;
type I18nSDK = { scope: (namespace: string) => ScopeFn };

// Prefer the live SDK if installed: closures it returns track the active
// locale, so /languages picker propagates to our render call sites. If the
// SDK isn't installed (standalone install of this extension without
// rpiv-i18n), the dynamic import fails, every t(key, fallback) returns the
// canonical English literal, and the extension stays online.
//
// The SDK is loaded in the background (see `activateI18nScope`, called from ../index.ts),
// never via top-level await: a blocking import here delays startup and can fail under CJS
// loaders. Until it lands, `t` returns the inline English fallback; afterwards it tracks
// the active locale.
let scopeImpl: ScopeFn | undefined;

export const t: ScopeFn = (key, fallback) => (scopeImpl ? scopeImpl(key, fallback) : fallback);

/** Resolve the live i18n scope. Resolves quietly (English fallbacks) if the SDK is absent. */
export async function activateI18nScope(): Promise<void> {
	try {
		const sdk = (await import("@juicesharp/rpiv-i18n")) as I18nSDK;
		scopeImpl = sdk.scope(I18N_NAMESPACE);
	} catch {
		// SDK absent: keep English fallbacks.
	}
}

const STATUS_LABEL_PENDING = "pending";
const STATUS_LABEL_IN_PROGRESS = "in progress";
const STATUS_LABEL_COMPLETED = "completed";
const STATUS_LABEL_DELETED = "deleted";

export function formatStatusLabel(status: TaskStatus): string {
	switch (status) {
		case "pending":
			return t("status.pending", STATUS_LABEL_PENDING);
		case "in_progress":
			return t("status.in_progress", STATUS_LABEL_IN_PROGRESS);
		case "completed":
			return t("status.completed", STATUS_LABEL_COMPLETED);
		case "deleted":
			return t("status.deleted", STATUS_LABEL_DELETED);
	}
}
