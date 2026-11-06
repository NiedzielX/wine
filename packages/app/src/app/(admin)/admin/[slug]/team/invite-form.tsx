'use client';

import { Alert, AlertDescription, AlertTitle, Button, Input, Label, NativeSelect, NativeSelectOption } from '@wine-match/ui';
import { useActionState } from 'react';
import type { InviteState } from '../team-actions';

export interface InviteLabels {
  email: string;
  role: string;
  submit: string;
  createdTitle: string;
  /** the sentence for the invitation just made (the address and the role are known only after the post) */
  createdText: (email: string, role: string) => string;
  linkLabel: string;
  errors: Record<string, string>;
}

/**
 * The invite form of A15 (spec E12 F2). A plain form post: `useActionState` lets the server render the result into the response of
 * the post, so the link shows without JavaScript too. The link is shown once; reloading the page does not bring it back.
 */
export function InviteForm({ action, slug, back, roles, roleNames, labels }: {
  action: (previous: InviteState, form: FormData) => Promise<InviteState>;
  slug: string;
  back: string;
  roles: string[];
  roleNames: Record<string, string>;
  labels: InviteLabels;
}) {
  const [state, formAction, pending] = useActionState(action, { status: 'idle' } as InviteState);
  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="back" value={back} />
        <div className="grid gap-1.5"><Label htmlFor="invite-email">{labels.email}</Label><Input id="invite-email" name="email" type="email" required maxLength={254} autoComplete="off" /></div>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-role">{labels.role}</Label>
          <NativeSelect id="invite-role" name="role" defaultValue={roles[0]}>
            {roles.map((r) => <NativeSelectOption key={r} value={r}>{roleNames[r]}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <Button type="submit" disabled={pending}>{labels.submit}</Button>
      </form>
      {state.status === 'error' && (
        <Alert variant="destructive" role="alert"><AlertDescription>{labels.errors[state.error] ?? labels.errors.unexpected}</AlertDescription></Alert>
      )}
      {state.status === 'created' && (
        <Alert className="border-transparent bg-sage-soft text-sage" role="status" data-invitation-link>
          <AlertTitle>{labels.createdTitle}</AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>{labels.createdText(state.email, roleNames[state.role] ?? state.role)}</p>
            <Label htmlFor="invite-link">{labels.linkLabel}</Label>
            <Input id="invite-link" readOnly value={state.link} autoComplete="off" className="font-mono text-xs" />
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
