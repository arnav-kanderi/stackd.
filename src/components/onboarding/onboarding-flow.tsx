import { useState } from 'react';
import { Alert } from 'react-native';

import { DemographicsScreen } from '@/components/onboarding/demographics-screen';
import { LinkedInConnectScreen } from '@/components/onboarding/linkedin-connect-screen';
import { OnboardingEntryScreen } from '@/components/onboarding/onboarding-entry-screen';
import { TagPickerScreen } from '@/components/onboarding/tag-picker-screen';
import { VaultCollectionScreen } from '@/components/onboarding/vault-collection-screen';
import type { LockedInterestTag } from '@/lib/onboarding/career-exam';
import {
  saveDemographics,
  saveLinkedInImport,
  saveOnboardingTags,
  type DemographicsInput,
} from '@/lib/onboarding/actions';

type Step = 'entry' | 'tags' | 'vault' | 'linkedin' | 'demographics';

/**
 * Orchestrates the full onboarding sequence.
 *
 * 2026-07-22 redesign (explicit user request, deviating from build-plan
 * §3/spec §2.1): the career exam is gone entirely as an onboarding path.
 * "Fill out my info" is now the default entry path:
 *   entry -> tags (required, >=1) -> vault (all optional) -> demographics -> done
 * "Connect LinkedIn instead" is untouched -- it still collects tags itself
 * via its own confirm_tags phase, then goes straight to demographics:
 *   entry -> linkedin -> demographics -> done
 *
 * The tag picker must run before the vault step: user_documents.user_id and
 * recommendation_contacts.user_id both FK to profiles(id), and the tag
 * picker's save is what upserts the profiles row into existence for a
 * brand-new user (no DB trigger creates one on signup).
 *
 * `onFinished` re-triggers the caller's profile refresh so the root layout
 * can re-evaluate `isOnboardingComplete` and swap to the real app tabs.
 */
export function OnboardingFlow({ userId, onFinished }: { userId: string; onFinished: () => Promise<void> | void }) {
  const [step, setStep] = useState<Step>('entry');
  const [submitting, setSubmitting] = useState(false);

  // A failed save keeps the user on the same step (rather than silently
  // losing their answers or advancing) so they can retry a network blip
  // (RLS misconfig, connectivity) -- normal validation errors are handled
  // inline by each step's own screen instead.
  async function runStep(save: () => Promise<{ error: { message: string } | null }>, onSuccess: () => void | Promise<void>) {
    setSubmitting(true);
    const { error } = await save();
    setSubmitting(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    await onSuccess();
  }

  const handleTagsComplete = (tags: LockedInterestTag[]) =>
    runStep(() => saveOnboardingTags(userId, tags), () => setStep('vault'));

  const handleLinkedInComplete = (tags: LockedInterestTag[]) =>
    runStep(() => saveLinkedInImport(userId, tags), () => setStep('demographics'));

  const handleDemographicsComplete = (input: DemographicsInput) =>
    runStep(() => saveDemographics(userId, input), onFinished);

  if (step === 'entry') {
    return (
      <OnboardingEntryScreen onPickFillInfo={() => setStep('tags')} onPickLinkedIn={() => setStep('linkedin')} />
    );
  }

  if (step === 'tags') {
    return <TagPickerScreen onComplete={handleTagsComplete} />;
  }

  if (step === 'vault') {
    return <VaultCollectionScreen userId={userId} onComplete={() => setStep('demographics')} />;
  }

  if (step === 'linkedin') {
    return <LinkedInConnectScreen onComplete={handleLinkedInComplete} />;
  }

  return <DemographicsScreen onComplete={handleDemographicsComplete} submitting={submitting} />;
}
