import { CheckIcon, CircleAlertIcon } from "lucide-react"
import { cn } from "../lib/utils"

/**
 * Status marker for checklists (done / needs attention). Lucide, the panel's single icon set,
 * so the panel never mixes glyphs such as ✓ with icons (docs/DESIGN_SYSTEM.md §3).
 * The text next to it says the status; the icon is decorative.
 */
export function StatusIcon({ done, className }: { done: boolean; className?: string }) {
  const Icon = done ? CheckIcon : CircleAlertIcon
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0", done ? "text-sage" : "text-brass", className)} />
}
