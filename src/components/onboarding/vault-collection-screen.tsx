import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addRecommendationContact,
  pickDocumentFile,
  uploadVaultDocument,
  uploadVaultText,
  VAULT_DOC_SECTIONS,
  type VaultDocType,
} from '@/lib/vault';

/**
 * Vault collection step (2026-07-22 onboarding redesign, build-plan item 3).
 * ALL fields optional/skippable -- matches the standalone Vault tab's
 * existing behavior exactly, per explicit user decision. Reuses the same
 * underlying vault-writing functions the standalone Vault tab
 * (src/app/vault.tsx) uses (uploadVaultDocument/uploadVaultText/
 * addRecommendationContact) -- not a parallel system, so anything entered
 * here shows up in the Vault tab afterward (same user_documents/
 * recommendation_contacts tables). This step must run after the tag picker
 * has upserted the profiles row (user_documents.user_id/
 * recommendation_contacts.user_id both FK to profiles(id), not
 * auth.users(id) directly), so a profile row must already exist.
 */
export function VaultCollectionScreen({
  userId,
  onComplete,
}: {
  userId: string;
  onComplete: () => void;
}) {
  const theme = useTheme();
  const [busyType, setBusyType] = useState<VaultDocType | null>(null);
  const [uploadedTypes, setUploadedTypes] = useState<Set<VaultDocType>>(new Set());
  const [textDraft, setTextDraft] = useState<Record<VaultDocType, string>>({
    resume: '',
    transcript: '',
    essay: '',
    activity_list: '',
  });
  const [contactForm, setContactForm] = useState({ name: '', email: '', relationship: '' });
  const [contactSaved, setContactSaved] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  async function handleFileUpload(docType: VaultDocType) {
    const file = await pickDocumentFile();
    if (!file) return;
    setBusyType(docType);
    // skipDedupeCheck: this is a brand-new onboarding profile -- it cannot
    // already have a document of this type, so the standalone Vault tab's
    // existing-duplicate lookup would just be a guaranteed-empty round trip.
    const { error } = await uploadVaultDocument(userId, docType, file, { skipDedupeCheck: true });
    setBusyType(null);
    if (error) {
      Alert.alert('Upload saved, parsing failed', error);
    }
    setUploadedTypes((prev) => new Set(prev).add(docType));
  }

  async function handleTextUpload(docType: VaultDocType) {
    const text = textDraft[docType].trim();
    if (!text) return;
    setBusyType(docType);
    const { error } = await uploadVaultText(userId, docType, docType, text, { skipDedupeCheck: true });
    setBusyType(null);
    if (error) {
      Alert.alert('Saved, parsing failed', error);
    }
    setTextDraft((prev) => ({ ...prev, [docType]: '' }));
    setUploadedTypes((prev) => new Set(prev).add(docType));
  }

  async function handleAddContact() {
    if (!contactForm.name.trim() || !contactForm.email.trim()) {
      Alert.alert('Missing info', 'Name and email are required to save a recommender.');
      return;
    }
    setSavingContact(true);
    const { error } = await addRecommendationContact(userId, contactForm);
    setSavingContact(false);
    if (error) {
      Alert.alert("Couldn't save contact", error);
      return;
    }
    setContactForm({ name: '', email: '', relationship: '' });
    setContactSaved(true);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="subtitle">Build your vault (optional)</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Add a resume, transcript, activities list, essay, or recommender now -- or skip and add them later from the
          Vault tab. Nothing here is required.
        </ThemedText>

        {VAULT_DOC_SECTIONS.map((section) => {
          const busy = busyType === section.type;
          const uploaded = uploadedTypes.has(section.type);
          return (
            <ThemedView key={section.type} type="backgroundElement" style={styles.section}>
              <ThemedText type="smallBold">{section.label}</ThemedText>
              {uploaded && (
                <ThemedText type="small" themeColor="textSecondary">
                  Saved ✓
                </ThemedText>
              )}
              {section.mode === 'file' ? (
                <Pressable
                  disabled={busy}
                  style={[styles.actionButton, { backgroundColor: theme.backgroundSelected }, busy && styles.disabled]}
                  onPress={() => handleFileUpload(section.type)}>
                  <ThemedText type="smallBold">{busy ? 'Uploading…' : `Upload ${section.label}`}</ThemedText>
                </Pressable>
              ) : (
                <>
                  <TextInput
                    multiline
                    placeholder={`Paste your ${section.label.toLowerCase()} text…`}
                    placeholderTextColor={theme.textSecondary}
                    value={textDraft[section.type]}
                    onChangeText={(t) => setTextDraft((prev) => ({ ...prev, [section.type]: t }))}
                    style={[styles.textInput, { color: theme.text, borderColor: theme.textSecondary }]}
                  />
                  <Pressable
                    disabled={busy}
                    style={[styles.actionButton, { backgroundColor: theme.backgroundSelected }, busy && styles.disabled]}
                    onPress={() => handleTextUpload(section.type)}>
                    <ThemedText type="smallBold">{busy ? 'Saving…' : `Save ${section.label}`}</ThemedText>
                  </Pressable>
                </>
              )}
            </ThemedView>
          );
        })}

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Recommendation Contact</ThemedText>
          {contactSaved && (
            <ThemedText type="small" themeColor="textSecondary">
              Saved ✓ -- add another below, or continue.
            </ThemedText>
          )}
          <View style={styles.contactFields}>
            <TextInput
              placeholder="Name"
              placeholderTextColor={theme.textSecondary}
              value={contactForm.name}
              onChangeText={(t) => setContactForm((prev) => ({ ...prev, name: t }))}
              style={[styles.fieldInput, { color: theme.text, borderColor: theme.textSecondary }]}
            />
            <TextInput
              placeholder="Email"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={contactForm.email}
              onChangeText={(t) => setContactForm((prev) => ({ ...prev, email: t }))}
              style={[styles.fieldInput, { color: theme.text, borderColor: theme.textSecondary }]}
            />
            <TextInput
              placeholder="Relationship (e.g. AP Bio teacher)"
              placeholderTextColor={theme.textSecondary}
              value={contactForm.relationship}
              onChangeText={(t) => setContactForm((prev) => ({ ...prev, relationship: t }))}
              style={[styles.fieldInput, { color: theme.text, borderColor: theme.textSecondary }]}
            />
          </View>
          <Pressable
            disabled={savingContact}
            style={[styles.actionButton, { backgroundColor: theme.backgroundSelected }, savingContact && styles.disabled]}
            onPress={handleAddContact}>
            <ThemedText type="smallBold">{savingContact ? 'Saving…' : 'Add Contact'}</ThemedText>
          </Pressable>
        </ThemedView>

        <Pressable style={[styles.continueButton, { backgroundColor: theme.accent }]} onPress={onComplete}>
          <ThemedText type="smallBold" style={styles.continueButtonText}>
            Continue
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  section: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  contactFields: { gap: Spacing.two },
  actionButton: { paddingVertical: Spacing.two, borderRadius: Spacing.two, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  textInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  continueButton: {
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  continueButtonText: {
    color: '#ffffff',
  },
});
