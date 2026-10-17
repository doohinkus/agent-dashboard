import { Plugin } from "@opencode/plugin";
import type { Result } from "@opencode/plugin/promise/tool";

const ENDPOINT = process.env.DASHBOARD_URL ?? "http://localhost:8100/event";
// Kill switch: set DASHBOARD_URL="" to disable streaming without uninstalling the plugin.
const DISABLED = ENDPOINT === "";

async function send(event: string, payload: Record<string, unknown>) {
  if (DISABLED) return;
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "opencode", event, ...payload }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // dashboard may be offline; never block a tool
  }
}

/** First 200 chars of the first text segment of a tool result. */
function summarize(result: Result | undefined) {
  const first = result?.content === undefined
    ? undefined
    : typeof result.content === "string"
    ? { type: "text", text: result.content }
    : result.content.find((item) => item.type === "text");
  return first?.text.slice(0, 200) ?? "";
}

export default Plugin.define({
  id: "dashboard",
  async setup(ctx) {
    await ctx.tool.hook("execute.before", (event) =>
      send("PreToolUse", { tool: event.tool, args: event.input }),
    );

    await ctx.tool.hook("execute.after", (event) =>
      event.status === "completed"
        ? send("PostToolUse", { tool: event.tool, args: summarize(event.result) })
        : send("PostToolUse", { tool: event.tool, args: `(error) ${event.error.message}`.slice(0, 200) }),
    );

    // Stream public server events; abort the loop when the plugin unloads.
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event.type === "session.created") await send("SessionStart", {});
          if (event.type === "session.idle") await send("Stop", {});
        }
      } catch {
        // subscription aborted during shutdown
      }
    })();

    return () => controller.abort();
  },
});
