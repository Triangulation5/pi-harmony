import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { getAgentDir } from "../../settings/path.ts";
import { unrefTimer } from "./spinner-loader.ts";

type HerdrAgentState = "working" | "idle";

const HERDR_ENV = process.env.HERDR_ENV;
const HERDR_SOCKET_PATH = process.env.HERDR_SOCKET_PATH;
const HERDR_SOCKET_ENDPOINT =
	process.platform === "win32" && HERDR_SOCKET_PATH
		? `\\\\.\\pipe\\${HERDR_SOCKET_PATH}`
		: HERDR_SOCKET_PATH;
const HERDR_PANE_ID = process.env.HERDR_PANE_ID;
const HERDR_SOURCE = "herdr:pi";
const HERDR_INTEGRATION_MARKER = "HERDR_INTEGRATION_ID=pi";
let officialInstalled: boolean | undefined;
let reportSeq = Date.now() * 1000;
let sessionId: string | undefined;
let sessionPath: string | undefined;
let sendInFlight = false;
let queued: { state: HerdrAgentState; seq: number } | undefined;
let lastState: HerdrAgentState | undefined;
let rootSession = false;

function hasOfficialIntegration(): boolean {
	if (officialInstalled !== undefined) return officialInstalled;
	try {
		const path = join(getAgentDir(), "extensions", "herdr-agent-state.ts");
		officialInstalled = existsSync(path) && readFileSync(path, "utf8").includes(HERDR_INTEGRATION_MARKER);
	} catch {
		officialInstalled = false;
	}
	return officialInstalled;
}

export function herdrEnabled(): boolean {
	return HERDR_ENV === "1" && !!HERDR_SOCKET_PATH && !!HERDR_PANE_ID && !hasOfficialIntegration();
}

function sendAttempt(request: unknown, timeoutMs: number): Promise<boolean> {
	if (!herdrEnabled()) return Promise.resolve(true);
	return new Promise((resolve) => {
		let done = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const finish = (delivered: boolean) => {
			if (done) return;
			done = true;
			if (timeout) clearTimeout(timeout);
			socket.destroy();
			resolve(delivered);
		};
		const socket = net.createConnection(HERDR_SOCKET_ENDPOINT!);
		socket.on("error", () => finish(false));
		socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
		socket.on("data", () => finish(true));
		socket.on("end", () => finish(false));
		timeout = setTimeout(() => finish(false), timeoutMs);
		unrefTimer(timeout);
	});
}

async function send(request: unknown): Promise<void> {
	if (await sendAttempt(request, 500)) return;
	await sendAttempt(request, 1500);
}

export function updateSessionRef(ctx: any): void {
	try {
		const file = ctx?.sessionManager?.getSessionFile?.();
		sessionPath = typeof file === "string" && file.startsWith("/") ? file : undefined;
	} catch { sessionPath = undefined; }
	try {
		const id = ctx?.sessionManager?.getSessionId?.();
		sessionId = typeof id === "string" && id.length > 0 ? id : undefined;
	} catch { sessionId = undefined; }
}

function sessionRef(): Record<string, unknown> | undefined {
	if (sessionPath) return { agent_session_path: sessionPath };
	if (sessionId) return { agent_session_id: sessionId };
	return undefined;
}

function withSession(params: Record<string, unknown>): Record<string, unknown> {
	const ref = sessionRef();
	return ref ? { ...params, ...ref } : params;
}

export async function reportSession(source?: string): Promise<void> {
	const ref = sessionRef();
	if (!ref) return;
	await send({
		id: `${HERDR_SOURCE}:session:${Date.now()}:${Math.random().toString(36).slice(2)}`,
		method: "pane.report_agent_session",
		params: {
			pane_id: HERDR_PANE_ID,
			source: HERDR_SOURCE,
			agent: "pi",
			seq: ++reportSeq,
			session_start_source: source,
			...ref,
		},
	});
}

async function sendState(state: HerdrAgentState, seq: number): Promise<void> {
	await send({
		id: `${HERDR_SOURCE}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
		method: "pane.report_agent",
		params: withSession({ pane_id: HERDR_PANE_ID, source: HERDR_SOURCE, agent: "pi", state, seq }),
	});
}

async function drainQueue(): Promise<void> {
	if (sendInFlight) return;
	sendInFlight = true;
	try {
		while (queued) {
			const next = queued;
			queued = undefined;
			await sendState(next.state, next.seq);
		}
	} finally {
		sendInFlight = false;
		if (queued) void drainQueue();
	}
}

export function publishState(state: HerdrAgentState, force = false): void {
	if (!herdrEnabled()) return;
	if (!force && state === lastState) return;
	lastState = state;
	queued = { state, seq: ++reportSeq };
	if (!sendInFlight) void drainQueue();
}

export function setRootSession(value: boolean): void { rootSession = value; }
export function isRootSession(): boolean { return rootSession; }
export function markWorking(ctx?: any): void {
	if (!rootSession) return;
	if (ctx) updateSessionRef(ctx);
	void reportSession().catch(() => {});
	publishState("working");
}
export function markIdle(ctx?: any, force = false): void {
	if (!rootSession) return;
	if (ctx) updateSessionRef(ctx);
	publishState("idle", force);
}
