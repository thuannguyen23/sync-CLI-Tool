// RTK OpenCode plugin — rewrites commands to use rtk for token savings.
// Compatible with OpenCode v2 (setup API) and v1 (legacy server export).
// Requires: rtk in PATH.

function rewriteWithRtk(command: string): string {
  try {
    const { spawnSync } = require("node:child_process")
    const res = spawnSync("rtk", ["rewrite", command], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    })
    if ((res.status === 0 || res.status === 3) && res.stdout) {
      const rewritten = res.stdout.trim()
      if (rewritten) return rewritten
    }
    return command
  } catch {
    return command
  }
}

// v1 legacy plugin export
export const RtkOpenCodePlugin = async (ctx?: any) => {
  return {
    "tool.execute.before": async (input: any, output: any) => {
      const tool = String(input?.tool ?? "").toLowerCase()
      if (tool !== "bash" && tool !== "shell") return
      const args = output?.args
      if (!args || typeof args !== "object") return

      const command = args.command
      if (typeof command !== "string" || !command) return

      try {
        const rewritten = rewriteWithRtk(command)
        if (rewritten && rewritten !== command) {
          args.command = rewritten
        }
      } catch {}
    },
  }
}

// v2 plugin export (required default export with id and setup)
export default {
  id: "rtk",
  async setup(ctx: any) {
    if (ctx?.tool?.hook) {
      await ctx.tool.hook("execute.before", async (event: any) => {
        const tool = String(event?.tool ?? "").toLowerCase()
        if (tool !== "bash" && tool !== "shell") return
        const args = event?.args
        if (!args || typeof args !== "object") return

        const command = args.command
        if (typeof command !== "string" || !command) return

        try {
          const rewritten = rewriteWithRtk(command)
          if (rewritten && rewritten !== command) {
            args.command = rewritten
          }
        } catch {}
      })
    }
  },
  server: RtkOpenCodePlugin,
}
