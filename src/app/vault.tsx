import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, SignInGate } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/hooks/use-profile';
import { useVault } from '@/hooks/use-vault';
import {
  addRecommendationContact,
  deleteRecommendationContact,
  deleteVaultDocument,
  pickDocumentFile,
  updateContactStatus,
  uploadVaultDocument,
  uploadVaultText,
  VAULT_DOC_SECTIONS as DOC_SECTIONS,
  type RecommendationContact,
  type VaultDocType,
} from '@/lib/vault';

const CONTACT_STATUS_CYCLE: RecommendationContact['status'][] = ['not_requested', 'requested', 'received'];

/**
 * AI Document Vault management screen (spec §2.4, build-plan item 1).
 * Resume/transcript are file uploads (parsed via the Section 4 pipeline);
 * activities list/essays accept pasted text (wrapped as a .txt upload so
 * the same parsing pipeline handles all doc types uniformly); recommenders
 * are a simple contact list with a tap-to-cycle status.
 */
export default function VaultScreen() {
  const theme = useTheme();
  const { userId } = useProfile();
  const { documents, contacts, loading, refresh } = useVault(userId);

  const [busyType, setBusyType] = useState<VaultDocType | null>(null);
  const [textDraft, setTextDraft] = useState<Record<VaultDocType, string>>({
    resume: '',
    transcript: '',
    essay: '',
    activity_list: '',
  });
  const [contactForm, setContactForm] = useState({ name: '', email: '', relationship: '' });
  const [savingContact, setSavingContact] = useState(false);

  if (!userId) {
    return <SignInGate label="Sign in to manage your vault" />;
  }

  async function handleFileUpload(docType: VaultDocType) {
    const file = await pickDocumentFile();
    if (!file) return;
    setBusyType(docType);
    const { error } = await uploadVaultDocument(userId!, docType, file);
    setBusyType(null);
    if (error) Alert.alert('Upload saved, parsing failed', error);
    await refresh();
  }

  async function handleTextUpload(docType: VaultDocType) {
    const text = textDraft[docType].trim();
    if (!text) return;
    setBusyType(docType);
    const { error } = await uploadVaultText(userId!, docType, docType, text);
    setBusyType(null);
    if (error) Alert.alert('Saved, parsing failed', error);
    setTextDraft((prev) => ({ ...prev, [docType]: '' }));
    await refresh();
  }

  async function handleAddContact() {
    if (!contactForm.name.trim() || !contactForm.email.trim()) {
      Alert.alert('Missing info', 'Name and email are required.');
      return;
    }
    setSavingContact(true);
    const { error } = await addRecommendationContact(userId!, contactForm);
    setSavingContact(false);
    if (error) {
      Alert.alert("Couldn't save contact", error);
      return;
    }
    setContactForm({ name: '', email: '', relationship: '' });
    await refresh();
  }

  async function handleCycleStatus(contact: RecommendationContact) {
    const idx = CONTACT_STATUS_CYCLE.indexOf(contact.status);
    const next = CONTACT_STATUS_CYCLE[(idx + 1) % CONTACT_STATUS_CYCLE.length];
    await updateContactStatus(contact.id, next);
    await refresh();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: BottomTabInset + Spacing.four }]}>
          <ThemedText type="title" style={styles.pageTitle}>
            Vault
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Store your resume, transcript, activities, essays, and recommenders once — the Prep popup pulls from here
            for every application.
          </ThemedText>

          {loading && documents.length === 0 && contacts.length === 0 && (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <ThemedText type="small" themeColor="textSecondary">
                Loading your vault…
              </ThemedText>
            </View>
          )}

          {!loading && documents.length === 0 && contacts.length === 0 && (
            <EmptyState
              title="Your vault is empty"
              subtitle="Add a resume, transcript, activities list, essay, or recommender below — the Prep popup surfaces whatever's here for each opportunity's stated requirements."
            />
          )}

          {DOC_SECTIONS.map((section) => {
            const docs = documents.filter((d) => d.doc_type === section.type);
            const busy = busyType === section.type;
            return (
              <ThemedView key={section.type} type="backgroundElement" style={styles.section}>
                <ThemedText type="smallBold">{section.label}</ThemedText>

                {docs.map((doc) => (
                  <View key={doc.id} style={styles.docRowGroup}>
                    <View style={styles.docRow}>
                      <ThemedText type="small" style={styles.docName} numberOfLines={1}>
                        📄 {doc.storage_path.split('/').pop()}
                        {doc.parsed_content ? ' · parsed' : doc.parsed_content_error ? ' · parsing failed' : ' · not parsed yet'}
                      </ThemedText>
                      <Pressable onPress={() => deleteVaultDocument(doc).then(refresh)}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Remove
                        </ThemedText>
                      </Pressable>
                    </View>
                    {/* Graceful AI-failure degraded state (build-plan §7 item 4):
                        a real per-document error, not silently missing content
                        or a one-time alert the student may have already dismissed. */}
                    {!doc.parsed_content && doc.parsed_content_error && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.parseErrorText}>
                        ⚠️ {doc.parsed_content_error}
                      </ThemedText>
                    )}
                  </View>
                ))}
                {docs.length === 0 && !loading && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Nothing saved yet.
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
            <ThemedText type="smallBold">Recommendation Contacts</ThemedText>
            {contacts.map((c) => (
              <View key={c.id} style={styles.docRow}>
                <ThemedText type="small" style={styles.docName} numberOfLines={1}>
                  {c.name} ({c.relationship}) — {c.email}
                </ThemedText>
                <Pressable onPress={() => handleCycleStatus(c)}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {c.status.replace('_', ' ')} ›
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => deleteRecommendationContact(c.id).then(refresh)}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Remove
                  </ThemedText>
                </Pressable>
              </View>
            ))}
            {contacts.length === 0 && !loading && (
              <ThemedText type="small" themeColor="textSecondary">
                No recommenders saved yet.
              </ThemedText>
            )}

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
            <Pressable
              disabled={savingContact}
              style={[styles.actionButton, { backgroundColor: theme.backgroundSelected }, savingContact && styles.disabled]}
              onPress={handleAddContact}>
              <ThemedText type="smallBold">{savingContact ? 'Saving…' : 'Add Contact'}</ThemedText>
            </Pressable>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: Spacing.four, gap: Spacing.three },
  pageTitle: { fontSize: 32, lineHeight: 38 },
  section: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  docRowGroup: { gap: Spacing.half },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, justifyContent: 'space-between' },
  docName: { flex: 1 },
  parseErrorText: { lineHeight: 18 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
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
});
