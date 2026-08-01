/**
 * Local helper: stop anything on :3000, then start the production server.
 *
 * Rebuilding while an old `next start` still holds the port leaves that process
 * serving a half-swapped .next directory — pages 500, chunks 404, and the test
 * run that follows is meaningless. This makes the restart deterministic.
 *
 *   node scripts/dev-restart.mjs          # kill + start (expects a build)
 *   node scripts/dev-restart.mjs --build  # kill + build + start
 *   node scripts/dev-restart.mjs --stop   # kill only
 */
import { execSync, spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

const args = process.argv.slice(2)
const PORT = 3000

function killPort() {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${PORT}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      const pids = new Set(
        out
          .split("\n")
          .map((l) => l.trim().split(/\s+/).pop())
          .filter((p) => p && /^\d+$/.test(p) && p !== "0")
      )
      for (const pid of pids) {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" })
        console.log(`stopped pid ${pid} on :${PORT}`)
      }
    } else {
      execSync(`lsof -ti tcp:${PORT} | xargs -r kill -9`, { stdio: "ignore" })
    }
  } catch {
    // Nothing listening — the normal case.
  }
}

async function waitForHealth(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`)
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    await sleep(1000)
  }
  return false
}

killPort()
await sleep(1500)

if (args.includes("--stop")) {
  console.log("stopped")
  process.exit(0)
}

if (args.includes("--build")) {
  console.log("building…")
  execSync("npm run build", { stdio: "inherit" })
}

const child = spawn("npm", ["run", "start"], {
  stdio: "ignore",
  detached: true,
  shell: true,
})
child.unref()

console.log((await waitForHealth()) ? "ready" : "TIMED OUT waiting for /api/health")
process.exit(0)
