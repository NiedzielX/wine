export type JsonSchema = Record<string, unknown>;
export interface ReviewSchemas { input: JsonSchema; output: JsonSchema }
export interface ValidateProblem { file: string; message: string }
export function loadSchemas(): ReviewSchemas;
/** Returns `"/pointer: message"` strings; empty means valid. Throws on a schema keyword it does not implement. */
export function validate(schema: JsonSchema, value: unknown, path?: string): string[];
export function checkFiles(paths: string[], schemas?: ReviewSchemas): { problems: ValidateProblem[]; checked: number };
export function main(argv?: string[], out?: Pick<Console, 'log' | 'error'>): number;
