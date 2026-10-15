import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RunningApp {
  url: string;
  /** everything the server printed so far: attach it to a failing test */
  logs(): string;
  stop(): Promise<void>;
}

/** A free TCP port on localhost (asks the OS, so parallel runs do not collide). */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) {
        server.close();
        reject(new Error('No port was assigned'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Starts an already-built Next.js app (`next start`) in its own process group and waits until it answers.
 * A process that exits before it answers is a failure with its log attached, not a timeout.
 */
export async function startBuiltApp(options: { cwd: string; env: Record<string, string>; readyPath: string; logFile?: string; timeoutMs?: number }): Promise<RunningApp> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const logFile = options.logFile;
  if (logFile) {
    mkdirSync(dirname(logFile), { recursive: true });
    writeFileSync(logFile, '');
  }
  let output = '';
  const write = (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
    if (logFile) appendFileSync(logFile, text);
  };

  const child: ChildProcess = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: options.cwd,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NEXT_TELEMETRY_DISABLED: '1', ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  child.stdout?.on('data', write);
  child.stderr?.on('data', write);

  let exited: number | null | undefined;
  child.on('exit', (code) => { exited = code; });

  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  while (Date.now() < deadline) {
    if (exited !== undefined) throw new Error(`The app exited with code ${exited} before it answered.\n${output}`);
    try {
      const res = await fetch(`${url}${options.readyPath}`, { signal: AbortSignal.timeout(3000) });
      await res.arrayBuffer();
      return {
        url,
        logs: () => output,
        stop: () => stopGroup(child)
      };
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  await stopGroup(child);
  throw new Error(`The app did not answer on ${url}${options.readyPath} within the time limit.\n${output}`);
}

function stopGroup(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.pid === undefined) return resolve();
    child.once('exit', () => resolve());
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      resolve();
    }
    setTimeout(() => {
      try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      resolve();
    }, 5000).unref();
  });
}
