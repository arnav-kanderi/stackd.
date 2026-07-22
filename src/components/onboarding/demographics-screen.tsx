import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow } from '@/components/chip-selector';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CITIZENSHIP_OPTIONS, GENDER_OPTIONS, GRADE_OPTIONS } from '@/lib/onboarding/demographics';
import type { DemographicsInput } from '@/lib/onboarding/actions';

/**
 * Demographic collection (spec §2.1, build-plan §3). Grade and location are
 * required in the UI -- eligibility filtering depends on them. Gender,
 * citizenship, and GPA are presented as clearly optional and can be skipped
 * entirely; this is deliberate (minors in the user base, App Store review
 * scrutiny on forced sensitive-field collection) -- not something to
 * "helpfully" make required.
 */
export function DemographicsScreen({
  onComplete,
  submitting,
}: {
  onComplete: (input: DemographicsInput) => void;
  submitting: boolean;
}) {
  const theme = useTheme();
  const [grade, setGrade] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [citizenship, setCitizenship] = useState<string | null>(null);
  const [gpa, setGpa] = useState('');
  const [error, setError] = useState('');

  const canContinue = !!grade && location.trim().length > 0;

  function handleContinue() {
    if (!canContinue) {
      setError('Grade and location are required to personalize your feed.');
      return;
    }
    const parsedGpa = gpa.trim() ? Number(gpa.trim()) : null;
    if (gpa.trim() && (Number.isNaN(parsedGpa) || parsedGpa! < 0 || parsedGpa! > 5)) {
      setError('Enter a valid GPA (e.g. 3.7), or leave it blank.');
      return;
    }
    onComplete({
      grade: grade!,
      location: location.trim(),
      gender,
      citizenship_status: citizenship,
      gpa: parsedGpa,
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="subtitle">A bit about you</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Grade and location help us match you to opportunities you&rsquo;re actually eligible for.
        </ThemedText>

        <Field label="Grade *">
          <Chips options={GRADE_OPTIONS} selected={grade} onSelect={setGrade} theme={theme} />
        </Field>

        <Field label="Location *" hint="City, State works great (e.g. Austin, TX)">
          <TextInput
            placeholder="City, State"
            placeholderTextColor={theme.textSecondary}
            value={location}
            onChangeText={setLocation}
            style={[styles.input, { color: theme.text, borderColor: theme.textSecondary }]}
          />
        </Field>

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.optionalHeading}>
          Optional — you can skip any of these
        </ThemedText>

        <Field label="Gender (optional)">
          <Chips options={GENDER_OPTIONS} selected={gender} onSelect={setGender} theme={theme} allowClear />
        </Field>

        <Field label="Citizenship status (optional)">
          <Chips options={CITIZENSHIP_OPTIONS} selected={citizenship} onSelect={setCitizenship} theme={theme} allowClear />
        </Field>

        <Field label="GPA (optional)">
          <TextInput
            placeholder="e.g. 3.7"
            placeholderTextColor={theme.textSecondary}
            value={gpa}
            onChangeText={setGpa}
            keyboardType="decimal-pad"
            style={[styles.input, { color: theme.text, borderColor: theme.textSecondary }]}
          />
        </Field>

        {!!error && (
          <ThemedText type="small" style={styles.errorText}>
            {error}
          </ThemedText>
        )}

        <Pressable
          disabled={submitting}
          style={[styles.button, { backgroundColor: theme.accent, opacity: submitting ? 0.6 : 1 }]}
          onPress={handleContinue}>
          <ThemedText type="smallBold" style={styles.buttonText}>
            {submitting ? 'Saving…' : 'Finish onboarding'}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <ThemedView style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
      {!!hint && (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
    </ThemedView>
  );
}

function Chips<T extends string>({
  options,
  selected,
  onSelect,
  theme,
  allowClear,
}: {
  options: readonly T[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  theme: { accent: string; backgroundElement: string; backgroundSelected: string };
  allowClear?: boolean;
}) {
  return (
    <ChipRow>
      {options.map((option) => {
        const isSelected = selected === option;
        return (
          <Chip
            key={option}
            label={option}
            selected={isSelected}
            onPress={() => onSelect(allowClear && isSelected ? null : option)}
            theme={theme}
          />
        );
      })}
    </ChipRow>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  field: {
    gap: Spacing.two,
  },
  optionalHeading: {
    marginTop: Spacing.two,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: Spacing.three,
    fontSize: 16,
  },
  button: {
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonText: {
    color: '#ffffff',
  },
  errorText: {
    color: '#d92d20',
  },
});
