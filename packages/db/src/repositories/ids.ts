/**
 * Ids reach the repositories from URLs (guest pages, public and panel API paths). PostgreSQL rejects a value that is
 * not a UUID in a uuid column with a driver error (`22P02`), which the app would turn into a 500; the memory
 * repositories simply find nothing. An id that is not a UUID cannot exist, so every lookup by an id that can come from
 * outside treats it as unknown, like the memory ones (lesson 2026-11-05-url-ids-vs-uuid-columns).
 *
 * The pattern is the canonical hyphenated form, in either case: PostgreSQL also accepts braces and unhyphenated input,
 * but ids are only ever generated in the canonical form, and it does not check version or variant, so neither do we.
 * Known divergence: PostgreSQL treats an upper-case UUID as the same id (the uuid type normalises case), the memory
 * repositories compare strings and do not. Ids are generated in lower case, so it only shows on a hand-edited link.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (id: string): boolean => UUID.test(id);
