/**
 * Runs once when the server starts (not during `next build`, which must work with no environment and no
 * database). The checks live in server/startup.ts; they are imported only for the Node.js runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { checkStartup } = await import('./server/startup');
  checkStartup();
}
