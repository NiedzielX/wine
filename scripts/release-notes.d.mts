export interface Section { start: number; end: number; heading: string; name: string | null; date: string | null; unreleased: boolean; valid: boolean }
export function validDate(date: string): boolean;
export function parseSections(text: string): { lines: string[]; sections: Section[] };
export function checkChangelog(text: string): string[];
export function checkUpgradeNotes(text: string): string[];
export function renderRelease(changelog: string, version: string, upgradeNotes?: string): { body: string; problems: string[] };
export function promote(changelog: string, version: string, date: string, upgradeNotes?: string): { changelog: string; upgradeNotes: string; problems: string[] };
export function main(argv?: string[], out?: Pick<Console, 'log' | 'error'>, stdout?: (text: string) => void): number;
