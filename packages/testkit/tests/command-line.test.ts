import { describe, expect, it } from 'vitest';
import { looksLikeFailure, parseBoolean, parseCount, parseText, sessionArgs } from '../src/command-line';

describe('sessionArgs: every command runs in a named session', () => {
  it('a valid name becomes the --session flag in front of the command', () => {
    expect(sessionArgs('wm-admin-1', ['open', 'http://x'])).toEqual(['--session', 'wm-admin-1', 'open', 'http://x']);
  });

  it('a name that could be read as a flag or a path is refused', () => {
    expect(() => sessionArgs('Bad Name', [])).toThrow(/Invalid browser session name/);
    expect(() => sessionArgs('-x', [])).toThrow();
    expect(() => sessionArgs('a'.repeat(65), [])).toThrow();
  });
});

describe('reading the answers of the CLI', () => {
  it('a boolean is true or false, and anything else is an error, not a guess', () => {
    expect(parseBoolean('true\n')).toBe(true);
    expect(parseBoolean(' false ')).toBe(false);
    expect(() => parseBoolean('maybe')).toThrow(/Expected true or false/);
  });

  it('a count is digits only', () => {
    expect(parseCount('3\n')).toBe(3);
    expect(parseCount('0')).toBe(0);
    expect(() => parseCount('two')).toThrow(/Expected a count/);
    expect(() => parseCount('')).toThrow();
  });

  it('text loses only the final line break, and a failure line is recognised anywhere in the output', () => {
    expect(parseText('Halka\n')).toBe('Halka');
    expect(parseText('Halka\r\n')).toBe('Halka');
    expect(parseText('Halka')).toBe('Halka');
    expect(looksLikeFailure('✗ Element not found')).toBe(true);
    expect(looksLikeFailure('ok\n  ✗ later line')).toBe(true);
    expect(looksLikeFailure('Dashboard')).toBe(false);
  });
});
