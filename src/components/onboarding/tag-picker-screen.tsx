import { TagSelector } from '@/components/onboarding/tag-selector';
import type { LockedInterestTag } from '@/lib/onboarding/career-exam';

/**
 * Required tag picker (2026-07-22 onboarding redesign). Replaces the career
 * exam as the "Fill out my info" path's source of profiles.interest_tags --
 * Stage-1 match scoring (src/lib/match-score.ts) depends on interest_tags
 * ever being populated, so this step is required (>=1 tag), unlike every
 * field in the vault-collection step that follows it.
 *
 * Thin wrapper over the shared TagSelector (extracted post-review so this
 * and LinkedIn's confirm_tags phase don't maintain two copies of the same
 * picker interaction).
 */
export function TagPickerScreen({ onComplete }: { onComplete: (tags: LockedInterestTag[]) => void }) {
  return (
    <TagSelector
      title="What are you into?"
      subtitle="Pick a few areas that match your interests -- this powers your match score, so choose at least one."
      onComplete={onComplete}
    />
  );
}
