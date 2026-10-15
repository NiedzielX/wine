/**
 * Node-only authentication helpers (scrypt, session tokens). A separate entry point
 * (`@wine-match/db/auth`) so that code that does not use the database does not load MikroORM.
 */
export { ScryptPasswordHasher, hashPassword, needsRehash, verifyPassword } from './scrypt';
export { NodeSessionTokens } from './tokens';
