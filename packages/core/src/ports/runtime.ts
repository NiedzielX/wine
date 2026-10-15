/** Time and identity come from outside, so core stays deterministic and testable. */
export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  uuid(): string;
}
