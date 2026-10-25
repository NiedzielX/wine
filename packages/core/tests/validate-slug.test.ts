import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, validateSlug } from '../src/services/restaurants/restaurant-service';

describe('validateSlug', () => {
  it('accepts well-formed slugs, including the 2 and 40 character limits', () => {
    expect(validateSlug('halka')).toBeNull();
    expect(validateSlug('bistro-nad-wisla')).toBeNull();
    expect(validateSlug('a1')).toBeNull();
    expect(validateSlug('a'.repeat(40))).toBeNull();
  });

  it.each(['', 'a', 'a'.repeat(41), 'Halka', 'has space', 'trailing-', '-leading', 'double--hyphen', 'pod_kreska', 'zażółć', ' halka'])(
    'rejects %j as invalid',
    (slug) => expect(validateSlug(slug)).toBe('invalid')
  );

  it('rejects reserved words that collide with routes', () => {
    for (const word of RESERVED_SLUGS.filter((w) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(w) && w.length >= 2)) {
      expect(validateSlug(word)).toBe('reserved');
    }
    expect(validateSlug('admin')).toBe('reserved');
  });

  it('does not normalise: upper case is invalid, not lower-cased', () => {
    expect(validateSlug('Admin')).toBe('invalid');
  });
});
