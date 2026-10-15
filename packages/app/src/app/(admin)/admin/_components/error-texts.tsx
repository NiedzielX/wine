'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { en } from '@/i18n/en';

export interface ErrorTexts { title: string; text: string; retry: string }

const ErrorTextsContext = createContext<ErrorTexts>(en.admin.error);

/**
 * The error state (`[slug]/error.tsx`) is a client component and cannot read the request's language; the dashboard
 * layout, which wraps it, hands it the texts in the right language here. English is the fallback.
 */
export function ErrorTextsProvider({ value, children }: { value: ErrorTexts; children: ReactNode }) {
  return <ErrorTextsContext.Provider value={value}>{children}</ErrorTextsContext.Provider>;
}

export const useErrorTexts = () => useContext(ErrorTextsContext);
