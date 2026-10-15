/** Domain errors. Services throw these; the app turns them into messages or HTTP codes. */
export class DomainError extends Error {
  constructor(readonly code: string, message: string, readonly fields?: Record<string, string>) {
    super(message);
    // A literal, never `new.target.name`: production builds minify class names, and callers recognise errors by name.
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super('not_found', `${what} not found.`);
    this.name = 'NotFoundError';
  }
}

/** Input that breaks a business rule (a note that is too long, deleting an engine pairing, …). */
export class ValidationError extends DomainError {
  constructor(code: string, message: string, fields?: Record<string, string>) {
    super(code, message, fields);
    this.name = 'ValidationError';
  }
}

/** The caller may not do this (a role without the permission). */
export class ForbiddenError extends DomainError {
  constructor(message = 'You do not have permission to do this.') {
    super('forbidden', message);
    this.name = 'ForbiddenError';
  }
}

/** Wrong e-mail or password, or a temporarily locked account — deliberately one message for all three. */
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('invalid_credentials', 'The e-mail or password is incorrect, or the account is temporarily locked.');
    this.name = 'InvalidCredentialsError';
  }
}

/** The password is right but no restaurant has given this user access to the dashboard (e.g. a waiter). */
export class NoPanelAccessError extends DomainError {
  constructor() {
    super('no_panel_access', 'This account has no access to the dashboard.');
    this.name = 'NoPanelAccessError';
  }
}

/** The record was changed by someone else since the caller read it. */
export class VersionConflictError extends DomainError {
  constructor() {
    super('version_conflict', 'This pairing was changed by someone else a moment ago. Reload to see the latest version.');
    this.name = 'VersionConflictError';
  }
}

/** A data-store invariant would be broken (e.g. two primary pairings for one dish). */
export class InvariantError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'InvariantError';
  }
}
