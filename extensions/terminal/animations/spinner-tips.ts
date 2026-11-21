import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getKeybindings } from "@earendil-works/pi-tui";
import { getAgentDir } from "../../settings/path.ts";

function formatKeyPart(part: string, options: { capitalize?: boolean }): string {
    const displayPart = process.platform === "darwin" && part.toLowerCase() === "alt" ? "Option" : part;
    return options.capitalize
        ? displayPart.charAt(0).toUpperCase() + displayPart.slice(1)
        : displayPart;
}

export function formatKeyText(key: string, options: { capitalize?: boolean } = { capitalize: true }): string {
    return key
        .split("/")
        .map((k) =>
            k
                .split("+")
                .map((part) => formatKeyPart(part, options))
                .join("+")
        )
        .join("/");
}

export function formatKeys(keys: string[], options: { capitalize?: boolean } = { capitalize: true }): string {
    return keys.length === 0 ? "" : formatKeyText(keys.join("/"), options);
}

const BUILTIN_ACTION_DEFAULTS: Record<string, string[]> = {
    "app.editor.external": ["ctrl+g"],
    "app.tools.expand": ["ctrl+o"],
    "app.interrupt": ["escape"],
    "app.clear": ["ctrl+c"],
    "app.thinking.toggle": ["ctrl+t"],
    "app.thinking.cycle": ["shift+tab"],
    "app.model.select": ["ctrl+l"],
    "app.model.cycleForward": ["ctrl+p"],
    "app.model.cycleBackward": [
        process.platform === "win32" || Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
            ? "alt+p"
            : "shift+ctrl+p",
    ],
    "app.message.copy": ["ctrl+x"],
    "app.message.followUp": [
        process.platform === "win32" || Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
            ? "ctrl+q"
            : "alt+enter",
    ],
    "app.message.dequeue": [
        process.platform === "win32" || Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
            ? "alt+q"
            : "alt+up",
    ],
    "tui.input.newLine": ["shift+enter", "ctrl+j"],
    "tui.editor.undo": [
        process.platform === "win32"
            ? "ctrl+z"
            : Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
                ? "alt+z"
                : "ctrl+-",
    ],
    "tui.editor.deleteWordBackward": ["ctrl+w", "alt+backspace"],
    "tui.altScreen.search": [
        process.platform === "win32" || Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
            ? "ctrl+f"
            : "ctrl+shift+f",
    ],
    "tui.altScreen.pageUp": ["pageUp"],
    "tui.altScreen.pageDown": ["pageDown"],
    "tui.altScreen.top": ["ctrl+home"],
    "tui.altScreen.bottom": ["ctrl+end"],
};

const USER_KEYBINDINGS_TTL_MS = 60_000;
let userKeybindingsCache: { value: Record<string, unknown> | undefined; expires: number } | undefined;

/** keybindings.json is only a fallback source, and tips are rare: read it at most once a minute. */
function readUserKeybindingsFile(): Record<string, unknown> | undefined {
    const now = Date.now();
    if (userKeybindingsCache && userKeybindingsCache.expires > now) return userKeybindingsCache.value;
    let value: Record<string, unknown> | undefined;
    try {
        const agentDir = getAgentDir();
        const raw = JSON.parse(readFileSync(join(agentDir, "keybindings.json"), "utf-8"));
        if (raw && typeof raw === "object") value = raw;
    } catch { /* no user keybindings */ }
    userKeybindingsCache = { value, expires: now + USER_KEYBINDINGS_TTL_MS };
    return value;
}

export function getActionShortcut(action: string, preferPrimary = true): string {
    let keys: string[] | undefined;
    try {
        const kb = getKeybindings();
        if (kb && typeof kb.getKeys === "function") {
            const resolved = kb.getKeys(action as any);
            if (Array.isArray(resolved) && resolved.length > 0) {
                keys = resolved as unknown as string[];
            }
        }
    } catch { /* ignore */ }

    if (!keys || keys.length === 0) {
        const raw = readUserKeybindingsFile();
        const val = raw?.[action];
        if (val) keys = Array.isArray(val) ? val.map(String) : [String(val)];
    }

    if (!keys || keys.length === 0) {
        keys = BUILTIN_ACTION_DEFAULTS[action];
    }

    if (!keys || keys.length === 0) {
        return "";
    }

    return preferPrimary
        ? formatKeyText(keys[0], { capitalize: true })
        : formatKeys(keys, { capitalize: true });
}

export function getKeybindTips(): string[] {
    const continueKey = process.platform === "darwin" ? "Shift+Option+Enter" : "Shift+Alt+Enter";
    const extEditor = getActionShortcut("app.editor.external") || "Ctrl+G";
    const toolsExpand = getActionShortcut("app.tools.expand") || "Ctrl+O";
    const interrupt = getActionShortcut("app.interrupt") || "Escape";
    const clear = getActionShortcut("app.clear") || "Ctrl+C";
    const newLine = getActionShortcut("tui.input.newLine") || "Shift+Enter";
    const thinkingToggle = getActionShortcut("app.thinking.toggle") || "Ctrl+T";
    const thinkingCycle = getActionShortcut("app.thinking.cycle") || "Shift+Tab";
    const modelSelect = getActionShortcut("app.model.select") || "Ctrl+L";
    const modelCycleFwd = getActionShortcut("app.model.cycleForward") || "Ctrl+P";
    const modelCycleBack = getActionShortcut("app.model.cycleBackward") || (process.platform === "win32" ? "Alt+P" : "Shift+Ctrl+P");
    const followUp = getActionShortcut("app.message.followUp") || (process.platform === "darwin" ? "Option+Enter" : "Alt+Enter");
    const dequeue = getActionShortcut("app.message.dequeue") || (process.platform === "darwin" ? "Option+Up" : "Alt+Up");
    const copyMsg = getActionShortcut("app.message.copy") || "Ctrl+X";
    const searchTranscript = getActionShortcut("tui.altScreen.search") || "Ctrl+Shift+F";
    const pageUp = getActionShortcut("tui.altScreen.pageUp") || "PageUp";
    const pageDown = getActionShortcut("tui.altScreen.pageDown") || "PageDown";
    const topMsg = getActionShortcut("tui.altScreen.top") || "Ctrl+Home";
    const bottomMsg = getActionShortcut("tui.altScreen.bottom") || "Ctrl+End";
    const undo = getActionShortcut("tui.editor.undo") || "Ctrl+-";

    return [
        `Press ${extEditor} to edit your prompt draft in your external editor`,
        `Press ${toolsExpand} to expand or collapse tool calls and output rows`,
        "Press Ctrl+Shift+O to toggle high-detail tool output mode",
        `Press ${continueKey} to continue generating the assistant response`,
        `Press ${interrupt} to abort streaming or cancel an in-progress response`,
        `Press ${clear} to clear your prompt editor or exit if already empty`,
        `Press ${newLine} to insert a newline without submitting`,
        `Press ${thinkingToggle} to collapse or expand thinking blocks`,
        `Press ${thinkingCycle} to cycle thinking level (off, minimal, low, medium, high)`,
        `Press ${modelSelect} to open the interactive model selector`,
        `Press ${modelCycleFwd} or ${modelCycleBack} to cycle through your configured models`,
        `Press ${followUp} to queue a follow-up message while the agent is working`,
        `Press ${dequeue} to restore queued follow-up messages back to the editor`,
        `Press ${searchTranscript} in fullscreen mode to search the rendered transcript`,
        `Press ${copyMsg} to copy the last assistant message or active selection`,
        `Use ${pageUp} and ${pageDown} to scroll through chat history in fullscreen mode`,
        `Press ${topMsg} or ${bottomMsg} to jump to the start or latest message`,
        `Press ${undo} to undo your last prompt edit`,
        "Run /hotkeys to view all active keyboard shortcuts configured for your terminal",
    ];
}

export const GENERAL_SPINNER_TIPS: readonly string[] = [
    // Context & Workspace
    "Mention @filename or relative paths to include file context directly",
    "Run /compact when context grows large to preserve your token budget",
    "Consecutive file reads and shell commands collapse into single rows",
    "Click any grouped tool call in fullscreen mode to inspect its details",
    "File edits automatically show syntax-highlighted diffs before running",

    // Subagents & Parallelism
    "Parallel subagents fold into compact rows and report status live",
    "Subagents can run tests, explore code, and draft fixes in parallel",
    "Monitor active and finished subagents in the Agents panel",

    // Commands & UI Configuration
    "Run /tools to configure tool call grouping, borders, and preview limits",
    "Run /tools header off to hide startup resource lists for a cleaner start",
    "Run /tools startup on to enable the Tetris-style Pi logo animation",
    "Run /tools thinking live|full|latest to change how reasoning blocks display",
    "Run /tools thinking-label on to show the ∴ Thinking: indicator",
    "Run /theme to adapt diffs, connectors, and spinners to your terminal theme",
    "Run /spinner to customize verb colors, animation styles, and shimmers",
    "Run /spinner style orbit to switch the spinner glyph to circle fills",
    "Run /spinner shimmer-style sparkle to add a fast shimmer over the verb",
    "Run /spinner dots disabled to hide the trailing dot suffix completely",
    "Run /spinner tips off to hide these tips during thinking",

    // Skills & Interactive Workflows
    "Use /skill:web-search-cli to search the web using DuckDuckGo Lite",
    "The ask_user_question tool presents interactive questionnaires when input is needed",
    "Shell commands that only change files render as clean file diffs",
];

// Built on first access, so importing this module does no keybinding work at all.
let defaultTipsCache: string[] | undefined;
const defaultTips = (): string[] => (defaultTipsCache ??= [...getKeybindTips(), ...GENERAL_SPINNER_TIPS]);
export const DEFAULT_SPINNER_TIPS: readonly string[] = new Proxy([] as string[], {
    get: (_target, key) => Reflect.get(defaultTips(), key),
    has: (_target, key) => Reflect.has(defaultTips(), key),
});

export function getAvailableTips(pi?: ExtensionAPI): string[] {
    const tips = [...getKeybindTips(), ...GENERAL_SPINNER_TIPS];
    try {
        const commands = pi?.getCommands?.();
        if (Array.isArray(commands)) {
            for (const cmd of commands) {
                if (!cmd || typeof cmd.name !== "string") continue;
                if (cmd.source === "skill" || cmd.name.startsWith("skill:")) {
                    const skillName = cmd.name.startsWith("skill:") ? cmd.name.slice(6) : cmd.name;
                    if (skillName === "web-search-cli") continue;
                    const desc = cmd.description ? `: ${cmd.description.slice(0, 50)}` : "";
                    tips.push(`Installed skill /${cmd.name}${desc}`);
                } else if (cmd.source === "prompt") {
                    const desc = cmd.description ? `: ${cmd.description.slice(0, 50)}` : "";
                    tips.push(`Prompt template /${cmd.name}${desc}`);
                }
            }
        }
    } catch { /* ignore */ }
    return tips;
}

export function pickRandomTip(exclude?: string, pi?: ExtensionAPI): string {
    const pool = getAvailableTips(pi).filter((t) => t !== exclude);
    if (pool.length === 0) return DEFAULT_SPINNER_TIPS[0];
    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
}

export const SPINNER_TIP_MIN_ELAPSED_MS = 7_000;
export const SPINNER_TIP_OCCASIONAL_CHANCE = 0.35;

let _tipEligibilityOverride: boolean | null = null;
export function setTipEligibilityOverrideForTests(override: boolean | null): void {
    _tipEligibilityOverride = override;
}

export function getTipEligibilityOverride(): boolean | null {
    return _tipEligibilityOverride;
}

export function shouldShowSpinnerTip(options: {
    tipsEnabled: boolean;
    elapsedMs: number;
    isEligible: boolean;
}): boolean {
    return options.tipsEnabled && options.isEligible && options.elapsedMs >= SPINNER_TIP_MIN_ELAPSED_MS;
}

