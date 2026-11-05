/**
 * core is runtime-agnostic (browser and Node) and compiles against plain ES2023 without DOM or
 * Node typings. structuredClone exists in both runtimes (Node 17+, all current browsers).
 */
declare function structuredClone<T>(value: T): T;

/** WHATWG URL, in every browser and in Node: only what `config/env.ts` reads (the scheme and the normalised host of PUBLIC_BASE_URL). */
declare class URL {
  constructor(url: string, base?: string);
  readonly protocol: string;
  readonly hostname: string;
}
