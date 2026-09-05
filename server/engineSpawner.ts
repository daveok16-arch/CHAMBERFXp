// Spawns the Python engine service (engine/server.py) as a child process of the
// Node web service so a single Render instance runs both. The engine listens on
// ENGINE_PORT (default 8800) on localhost and the Node proxy reaches it via
// ENGINE_URL. The child is stopped on shutdown.
import { spawn, ChildProcess } from "child_process";
import net from "net";

const ENGINE_PORT = process.env.ENGINE_PORT || "8800";
const ENGINE_URL = process.env.ENGINE_URL || `http://localhost:${ENGINE_PORT}`;

let child: ChildProcess | null = null;
let started = false;

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

export async function startEngineIfNeeded(): Promise<boolean> {
  if (started) return true;
  started = true;

  // If the engine is already reachable (external service / manual run), skip.
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const res = await fetch(`${ENGINE_URL}/health`, { signal: ctl.signal });
    clearTimeout(t);
    if (res.ok) {
      console.log(`[engine] already reachable at ${ENGINE_URL}; not respawning`);
      return true;
    }
  } catch {
    /* not reachable -> spawn */
  }

  if (!(await portFree(Number(ENGINE_PORT)))) {
    console.log(`[engine] port ${ENGINE_PORT} busy; assuming engine running`);
    return true;
  }

  console.log(`[engine] spawning engine/server.py on :${ENGINE_PORT}`);
  // IMPORTANT: do NOT pass the web service's PORT to the engine child, or it
  // will try to bind the web port and collide. The engine uses ENGINE_PORT.
  const childEnv: Record<string, string | undefined> = { ...process.env, ENGINE_PORT, PORT: "", PYTHONUNBUFFERED: "1" };
  child = spawn("python3", ["engine/server.py"], {
    cwd: process.cwd(),
    env: childEnv as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => process.stdout.write(`[engine] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[engine] ${d}`));
  child.on("exit", (code) => {
    console.log(`[engine] engine service exited code=${code}`);
    child = null;
  });
  return true;
}

export function stopEngine() {
  if (child && child.pid) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    child = null;
  }
}