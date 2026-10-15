import { cache } from 'react';
import { createRequestScope } from './container';

/**
 * One DI scope per server render: React's cache() shares it across all server components of
 * the same request. Route handlers call createRequestScope() directly.
 */
export const getRequestScope = cache(createRequestScope);
