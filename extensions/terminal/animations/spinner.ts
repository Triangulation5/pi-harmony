import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readMergedSettings } from "../../settings/store.ts";
import { patchSpinnerLoader } from "./spinner-loader.ts";
import { createSpinnerRuntime, easeTokenCount } from "./spinner-runtime.ts";
import { registerSpinnerEvents } from "./spinner-events.ts";
import { RESET, getTipDim } from "./spinner-settings.ts";

export {
	DEFAULT_SPINNER_TIPS,
	GENERAL_SPINNER_TIPS,
	getActionShortcut,
	getAvailableTips,
	getKeybindTips,
	formatKeyText,
	formatKeys,
	pickRandomTip,
	setTipEligibilityOverrideForTests,
	shouldShowSpinnerTip,
	SPINNER_TIP_MIN_ELAPSED_MS,
	SPINNER_TIP_OCCASIONAL_CHANCE,
} from "./spinner-tips.ts";
export { describeToolActivity } from "./spinner-activity.ts";
export { easeTokenCount };

export function formatTipLine(tip: string, tipDim: string = getTipDim(), reset: string = RESET): string {
	return `  ${tipDim}└ Tip: ${tip}${reset}`;
}

patchSpinnerLoader();

export default function (pi: ExtensionAPI): void {
	if (readMergedSettings().claudeUi === false) return;
	const runtime = createSpinnerRuntime(pi);
	registerSpinnerEvents(pi, runtime);
}
