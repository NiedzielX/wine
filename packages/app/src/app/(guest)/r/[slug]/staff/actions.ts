'use server';

import { DEFAULT_PREFS, codeActionSchema, isLocale, normalizeCode, parseSessionId, parseWith, SLUG_PATTERN, type CodeActionInput } from '@wine-match/core';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createRequestScope } from '@/server/container';
import { domainError } from '@/server/domain-errors';
import { hrefWith } from '@/server/guest-page';
import { logger } from '@/server/logger';

/**
 * "Ordered" / "Undo" on the staff view G9 (spec 2026-10-16-recommendation-code, phase 2: R6, R7, Q7, Q8). A plain form
 * post that works without JavaScript; it calls the command on `RecommendationCodeService` with the actor `staff_view`
 * and redirects back to G9 with the result in the URL (`marked=confirmed|undone` or `codeError=not_found`).
 *
 * Deliberately public (Q8, approved): the staff view has no sign-in (D03), so there is no `authorizeAction` and no
 * `act()` (those are the dashboard's doors). The check is the code itself — only a code of this restaurant's current
 * service day is changed. A request a browser marks `Sec-Fetch-Site: cross-site` is refused here, as `handle()` does
 * for the API; Next.js itself refuses a server action whose `Origin` does not match the host. The redirect is built
 * from trusted parts only: a slug of the slug pattern, a valid `sid`, `lang` of `pl|en` — never an address from the form.
 */
export async function markCode(form: FormData): Promise<never> {
  const field = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : undefined; };
  let input: CodeActionInput;
  try {
    input = parseWith(codeActionSchema, { slug: field('slug') ?? '', code: field('code') ?? '', intent: field('intent') ?? '', sid: field('sid'), lang: field('lang') });
  } catch (e) {
    if (!domainError(e)) throw e;
    // a form we did not render: back to the staff view of a valid slug with the one "not found" answer, else home
    const slug = field('slug') ?? '';
    redirect(slug.length >= 2 && slug.length <= 40 && SLUG_PATTERN.test(slug) ? `/r/${slug}/staff?codeError=not_found` : '/');
  }

  const path = `/r/${input.slug}/staff`;
  const lang = input.lang && isLocale(input.lang) ? input.lang : undefined;
  const sid = parseSessionId({ sid: input.sid }) ?? undefined;
  const code = normalizeCode(input.code) ?? input.code.trim();
  const back = (flash: Record<string, string> = {}) => hrefWith(path, DEFAULT_PREFS, { code, ...flash }, { lang, sid });

  if ((await headers()).get('sec-fetch-site') === 'cross-site') {
    logger.warn('recommendation code action refused', { slug: input.slug, reason: 'cross-site' });
    redirect(back());
  }

  let flash: Record<string, string>;
  const scope = await createRequestScope();
  try {
    const service = scope.cradle.recommendationCodeService;
    if (input.intent === 'confirm') await service.confirm(input.slug, input.code, 'staff_view');
    else await service.undo(input.slug, input.code, 'staff_view');
    flash = { marked: input.intent === 'confirm' ? 'confirmed' : 'undone' };
  } catch (e) {
    if (domainError(e)?.code !== 'code_not_found') {
      logger.error('recommendation code action failed', { err: e, slug: input.slug });
      throw e;
    }
    flash = { codeError: 'not_found' };
  } finally {
    await scope.dispose();
  }
  revalidatePath(path, 'layout');
  redirect(back(flash));
}
