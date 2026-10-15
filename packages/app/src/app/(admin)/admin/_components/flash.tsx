import { Alert, AlertDescription, AlertTitle } from '@wine-match/ui';

/**
 * Result of the last change, carried in the URL (`?saved=…` or `?error=…`) so it works without
 * JavaScript and survives the redirect after a form post.
 */
const SAVED: Record<string, (n?: string) => string> = {
  approved: () => 'Pairing approved.',
  rejected: () => 'Pairing rejected. It won’t be recommended with this dish once you publish.',
  restored: () => 'Pairing restored as a suggestion.',
  role: () => 'Role updated.',
  note: () => 'Note saved.',
  moved: () => 'Order updated.',
  added: () => 'Pairing added.',
  deleted: () => 'Pairing deleted.',
  approved_all: (n) => `${n ?? '0'} pairings approved.`,
  wine_shown: () => 'The wine is back on the list. Guests can see it now.',
  wine_hidden: () => 'The wine is hidden from guests. They no longer see it.',
  published: (n) => `Published version ${n ?? ''}. Guests see the changes now.`,
  settings: () => 'Setting saved. It applies to guests right away.',
  import_uploaded: () => 'File read. Check the rows below, correct what needs it, then import.',
  import_checked: () => 'Rows checked again.',
  imported: (n) => {
    const [created, updated, suggestions] = (n ?? '0-0-0').split('-').map(Number);
    return `Imported: ${created} new, ${updated} updated. ${suggestions} engine suggestions are ready for review.`;
  },
  import_cancelled: () => 'Import cancelled. Nothing was changed.',
  details: () => 'Details saved.',
  details_slug: () => 'Details saved. The address of your guest app changed: print new QR codes, the old ones no longer work.',
  suggestions: (n) => `${n ?? '0'} engine suggestions added.`
};

const ERRORS: Record<string, string> = {
  version_conflict: 'This pairing was changed by someone else a moment ago. The page now shows the latest version, please try again.',
  forbidden: 'You don’t have permission to do that.',
  comment_too_long: 'The note can have at most 140 characters.',
  already_paired: 'This wine is already paired with the dish.',
  wine_required: 'Choose a wine to pair.',
  wine_not_available: 'This wine is hidden from guests. Show it on the wine list first.',
  invalid_role: 'Choose primary, alternative or best value.',
  primary_is_pinned: 'The primary pairing always stays first.',
  cannot_move: 'This pairing cannot move further in that direction.',
  not_rejected: 'Only a rejected pairing can be restored.',
  pairing_rejected: 'Restore the pairing first.',
  only_manual_pairings_can_be_deleted: 'Engine pairings can be rejected, not deleted.',
  nothing_to_publish: 'There are no unpublished changes.',
  multiple_primary: 'A dish can have only one primary pairing.',
  duplicate_pairing: 'A dish and a wine can be paired only once.',
  not_found: 'That item no longer exists.',
  no_file: 'Choose a file to upload.',
  file_too_large: 'The file is larger than 10 MB, or too large once unpacked.',
  empty_file: 'The file is empty or has no data.',
  unsupported_format: 'This kind of file is not supported. Upload a CSV, Excel (.xlsx) or PDF file.',
  legacy_xls: 'Old Excel files (.xls) are not supported. Save the file as .xlsx or CSV and upload it again.',
  format_mismatch: 'The file is not what its name says (for example a text file named .xlsx). Export it again from your system.',
  corrupt_file: 'The file could not be opened. It may be damaged or password-protected. Try saving it again, or use CSV.',
  scanned_pdf: 'This PDF has no text (it looks like a scan or a photo). Reading images is not supported: export a CSV or Excel file from your system.',
  too_many_rows: 'The file has more than 2000 rows. Split it and import in parts.',
  no_rows: 'The file has a header but no rows.',
  job_closed: 'This import is already finished. Start a new one.',
  no_rows_selected: 'Tick at least one row to import.',
  unknown_row: 'That row does not exist in this import.',
  invalid_kind: 'Import either the menu or the wine list.',
  slug_taken: 'Another restaurant already uses this address name. Choose another.',
  validation_failed: 'Check the details. The address name can use only lowercase letters, digits and hyphens (2 to 40 characters) and must not be a reserved word.',
  unexpected: 'The change could not be saved. Nothing was changed; try again.'
};

export function Flash({ saved, error, n }: { saved?: string; error?: string; n?: string }) {
  if (error) {
    return (
      <Alert variant="destructive" className="mb-5" role="alert">
        <AlertTitle>Not saved</AlertTitle>
        <AlertDescription>{ERRORS[error] ?? ERRORS.unexpected}</AlertDescription>
      </Alert>
    );
  }
  const text = saved ? SAVED[saved]?.(n) : undefined;
  if (!text) return null;
  return (
    <Alert className="mb-5 border-transparent bg-sage-soft text-sage" role="status">
      <AlertTitle>{text}</AlertTitle>
    </Alert>
  );
}

/** Shown to roles that may look but not change (the general manager on the pairing screens). */
export function ReadOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <Alert className="mb-5" role="note">
      <AlertTitle>View only</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
