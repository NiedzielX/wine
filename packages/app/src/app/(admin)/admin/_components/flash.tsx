import { Alert, AlertDescription, AlertTitle } from '@wine-match/ui';
import type { ReactNode } from 'react';
import { getI18n } from '@/server/i18n';
import { errorText, missingColumnsText, savedText } from './messages';

/**
 * Result of the last change, carried in the URL (`?saved=…` or `?error=…`) so it works without
 * JavaScript and survives the redirect after a form post. The message is chosen by its code in the dashboard's
 * language (spec 2026-10-15-polish-language, R13); an unknown error code says "the change could not be saved",
 * an unknown saved code says nothing.
 */
export async function Flash({ saved, error, n }: { saved?: string; error?: string; n?: string }) {
  const { t } = await getI18n();
  const f = t.admin.flash;
  if (error) {
    return (
      <Alert variant="destructive" className="mb-5" role="alert">
        <AlertTitle>{f.notSaved}</AlertTitle>
        <AlertDescription>{(error === 'no_header' && missingColumnsText(t, n)) || errorText(f, error)}</AlertDescription>
      </Alert>
    );
  }
  const text = savedText(f, saved, n);
  if (!text) return null;
  return (
    <Alert className="mb-5 border-transparent bg-sage-soft text-sage" role="status">
      <AlertTitle>{text}</AlertTitle>
    </Alert>
  );
}

/** Shown to roles that may look but not change (the general manager on the pairing screens). */
export async function ReadOnlyNotice({ children }: { children: ReactNode }) {
  const f = (await getI18n()).t.admin.flash;
  return (
    <Alert className="mb-5" role="note">
      <AlertTitle>{f.viewOnly}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
