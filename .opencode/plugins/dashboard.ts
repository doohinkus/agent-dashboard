import type { Plugin } from "@opencode-ai/plugin";

const URL = process.env.DASHBOARD_URL ?? "http://localhost:8000/event";

async function send(event: string, payload: Record<string, unknown>) {
  try {
    await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "opencode", event, ...payload }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // dashboard may be offline; never block a tool
  }
}

export const DashboardPlugin: Plugin = async () => ({
  "tool.execute.before": async (input, output) =>
    send("PreToolUse", { tool: input.tool, args: output.args }),

  "tool.execute.after": async (input, output) =>
    send("PostToolUse", {
      tool: input.tool,
      args:
        typeof (output as { output?: unknown }).output === "string"
          ? (output as { output: string }).output.slice(0, 200)
          : "",
    }),

  event: async ({ event }) => {
    if (event.type === "session.created") await send("SessionStart", {});
    if (event.type === "session.idle") await send("Stop", {});
  },
});
