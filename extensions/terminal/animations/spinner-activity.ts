import { basename } from "node:path";

function clip(text: string, max: number): string {
    const oneLine = text.split("\n")[0]?.trim() ?? "";
    return oneLine.length > max ? oneLine.slice(0, max).trimEnd() : oneLine;
}

function humanizeToolName(name: string): string {
    const direct = /^mcp__.+?__(.+)$/.exec(name);
    return (direct ? direct[1] : name)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Describe the latest tool for the working line. Random verbs remain for idle thinking.
export function describeToolActivity(name: string, args: any): string {
    const str = (...keys: string[]): string => {
        for (const key of keys) {
            const value = args?.[key];
            if (typeof value === "string" && value.trim()) return value.trim();
        }
        return "";
    };
    const file = basename(str("path", "file_path"));
    switch (name) {
        case "bash": {
            const command = clip(str("command"), 50);
            return command ? `Running ${command}` : "Running a shell command";
        }
        case "read":
            return file ? `Reading ${file}` : "Reading a file";
        case "edit":
            return file ? `Editing ${file}` : "Editing a file";
        case "write":
            return file ? `Writing ${file}` : "Writing a file";
        case "grep":
        case "find": {
            const pattern = clip(str("pattern"), 40);
            return pattern ? `Searching for ${pattern}` : "Searching";
        }
        case "ls":
            return `Listing ${str("path") || "."}`;
        case "Agent": {
            const description = clip(str("description"), 50);
            return description ? `Waiting for agent: ${description}` : "Waiting for an agent";
        }
        case "ask_user_question":
        case "questionnaire":
        case "question":
            return "Waiting for your answer";
        default:
            return `Running ${humanizeToolName(name)}`;
    }
}

/** Format elapsed ms as compact duration: 5s, 1m 23s, 1h 2m 3s. */
export function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function formatCount(value: number): string {
    return new Intl.NumberFormat("en-US").format(value);
}

/** Characters the model produced in one content block: text, thinking, or tool-call arguments. */
export function contentBlockLength(block: any): number {
    if (block?.type === "text" && typeof block.text === "string") return block.text.length;
    if (block?.type === "thinking" && typeof block.thinking === "string") return block.thinking.length;
    if (block?.type === "toolCall") {
        try {
            return JSON.stringify(block.arguments ?? {}).length;
        } catch {
            return 0;
        }
    }
    return 0;
}

/** Output tokens of a finished assistant message: the provider's count, or an estimate (chars / 4). */
export function messageOutputTokens(message: any): number {
    const reported = message?.usage?.output;
    if (typeof reported === "number" && Number.isFinite(reported) && reported > 0) return reported;
    if (!Array.isArray(message?.content)) return 0;
    return Math.round(message.content.reduce((sum: number, block: any) => sum + contentBlockLength(block), 0) / 4);
}

