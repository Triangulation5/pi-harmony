import { getAgentDir } from "@earendil-works/pi-coding-agent";

export { getAgentDir };

/** Pi's own settings file (`<agentDir>/settings.json`, by default `~/.pi/agent/settings.json`, `%USERPROFILE%\.pi\agent\settings.json` on Windows). */
export function getUserSettingsPath(): string {
	return `${getAgentDir()}/settings.json`;
}
