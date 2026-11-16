import { Button } from '@wine-match/ui';
import type { Locale } from '@wine-match/core';
import { loginAsDemo } from '../auth-actions';
import type { DemoAccount as Account } from '@/server/demo-entry';

/**
 * One demo account on the interactive instance (spec 2026-11-16-interactive-demo-entry, R5; changed by the owner's review 2026-11-16):
 * a solid, clearly clickable "Sign in as" button and, under it, the e-mail and the public demo password as selectable text, so a visitor can
 * also type them into the ordinary form. The form still carries only the account key and the language; the password is plain text for a
 * person to copy, never a field value and never the hash. Only rendered where `demoAccounts` returned the account (interactive mode).
 */
export function DemoAccountForm({ account, locale, label, emailLabel, passwordLabel }: { account: Account; locale: Locale; label: string; emailLabel: string; passwordLabel: string }) {
  return (
    <div data-demo-account={account.key} className="grid gap-2">
      <form action={loginAsDemo}>
        <input type="hidden" name="key" value={account.key} />
        <input type="hidden" name="lang" value={locale} />
        <Button type="submit" size="lg" className="h-auto min-h-11 w-full justify-center whitespace-normal py-2 text-center shadow-sm">{label}</Button>
      </form>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{emailLabel}</dt>
        <dd><code data-demo-email className="select-all break-all rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{account.email}</code></dd>
        <dt className="text-muted-foreground">{passwordLabel}</dt>
        <dd><code data-demo-password className="select-all break-all rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{account.password}</code></dd>
      </dl>
    </div>
  );
}
