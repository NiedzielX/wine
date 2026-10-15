'use server';

import { isLocale } from '@wine-match/core';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { languageBack, secureCookies } from '@/server/auth';
import { LANG_COOKIE, langCookieOptions } from '@/server/lang-cookie';

/**
 * The "PL | EN" switch of the dashboard and the sign-in page (spec 2026-10-15-polish-language, R4): a plain form
 * post, so it works without JavaScript. It needs no session and never touches one: it only stores the chosen
 * language in `wm_lang` (anything but `pl` / `en` is ignored) and goes back to the validated page.
 */
export async function setLanguage(form: FormData) {
  const lang = form.get('lang');
  if (isLocale(lang)) (await cookies()).set(LANG_COOKIE, lang, langCookieOptions(secureCookies()));
  // every dashboard page renders in the new language, also the ones the client router kept (server-action-layout-revalidate)
  revalidatePath('/admin', 'layout');
  redirect(languageBack(String(form.get('back') ?? '')));
}
