import { createServer, connect, type Server, type Socket } from 'node:net';

export interface TcpRelay {
  /** the address clients connect to, e.g. `127.0.0.1:50999` */
  host: string;
  port: number;
  /** stop listening and cut every open connection: to its clients the server is gone */
  stop(): Promise<void>;
  /** listen again on the SAME port: the server is back */
  start(): Promise<void>;
}

/**
 * A TCP forwarder in front of a server, for tests of "the database goes away and comes back" without touching the
 * database itself: the application connects to the relay, the test stops and starts it. Listens on 127.0.0.1.
 */
export async function createTcpRelay(target: { host: string; port: number }): Promise<TcpRelay> {
  const sockets = new Set<Socket>();
  let server: Server | undefined;
  let port = 0;

  const listen = (wanted: number) => new Promise<void>((resolve, reject) => {
    const s = createServer((client) => {
      const upstream = connect(target.port, target.host);
      for (const socket of [client, upstream]) {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => socket.destroy());
      }
      client.pipe(upstream);
      upstream.pipe(client);
      client.on('close', () => upstream.destroy());
      upstream.on('close', () => client.destroy());
    });
    s.once('error', reject);
    s.listen(wanted, '127.0.0.1', () => {
      port = (s.address() as { port: number }).port;
      server = s;
      resolve();
    });
  });

  await listen(0);
  return {
    host: '127.0.0.1',
    get port() { return port; },
    async stop() {
      const s = server;
      server = undefined;
      for (const socket of sockets) socket.destroy();
      if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
    },
    async start() {
      if (!server) await listen(port);
    }
  } as TcpRelay;
}
