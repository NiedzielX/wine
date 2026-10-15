/**
 * core is runtime-agnostic (browser and Node) and compiles against plain ES2023 without DOM or
 * Node typings. structuredClone exists in both runtimes (Node 17+, all current browsers).
 */
declare function structuredClone<T>(value: T): T;
