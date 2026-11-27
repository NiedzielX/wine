export const REVIEW_INDEPENDENCE_SINCE: string;
export const REVIEW_INDEPENDENCE_VALUES: string[];
export interface ReviewIndependenceFinding {
  level: 'error' | 'warning';
  /** true: an older specification without the field (counted in the report). */
  missing?: boolean;
  message: string;
}
export function checkReviewIndependence(name: string, text: string): ReviewIndependenceFinding[];
