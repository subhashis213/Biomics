import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { DateField, ErrorBanner, Field, PrimaryButton } from '@/src/components/ui';

export type GoogleProfileDraft = {
  completionToken: string;
  email: string;
  name: string;
  phone: string;
  birthDate: string;
};

type Props = {
  visible: boolean;
  draft: GoogleProfileDraft | null;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (phone: string, birthDate: string) => void;
};

export default function GoogleProfileSheet({ visible, draft, submitting, error, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');

  useEffect(() => {
    if (!visible || !draft) return;
    setPhone(String(draft.phone || '').replace(/\D/g, '').slice(0, 10));
    setBirthDate(String(draft.birthDate || '').trim());
  }, [visible, draft]);

  const canSubmit =
    /^\d{10}$/.test(phone.trim()) &&
    /^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim()) &&
    !submitting;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close profile form" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.head}>
              <Text style={styles.title}>Complete your profile</Text>
              <Text style={styles.subtitle}>
                Google sign-in succeeded. Add the details below once to finish creating your BiomicsHub account.
              </Text>
            </View>

            <ErrorBanner message={error} />

            <View style={styles.readonlyBlock}>
              <Text style={styles.readonlyLabel}>Email</Text>
              <Text style={styles.readonlyValue}>{draft?.email || '—'}</Text>
            </View>
            {draft?.name ? (
              <View style={styles.readonlyBlock}>
                <Text style={styles.readonlyLabel}>Name</Text>
                <Text style={styles.readonlyValue}>{draft.name}</Text>
              </View>
            ) : null}
            <Field
              label="Mobile number"
              value={phone}
              onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
            />
            <DateField
              label="Date of birth"
              value={birthDate}
              onChange={setBirthDate}
            />

            <PrimaryButton
              label={submitting ? 'Saving…' : 'Save & continue'}
              onPress={() => onSubmit(phone.trim(), birthDate.trim())}
              disabled={!canSubmit}
            />
            <Pressable onPress={onClose} style={styles.cancelWrap}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </ScrollView>
          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(c: ThemeColors, bottomInset: number) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end'
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(8, 12, 20, 0.55)'
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '88%',
      paddingBottom: Math.max(bottomInset, 16)
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: 999,
      backgroundColor: c.border,
      marginTop: 10,
      marginBottom: 6
    },
    closeBtn: {
      position: 'absolute',
      top: 14,
      right: 14,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.cardAlt
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
      gap: 4
    },
    head: {
      marginBottom: 8
    },
    title: {
      color: c.text,
      fontSize: 22,
      fontWeight: '800'
    },
    subtitle: {
      color: c.muted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 6
    },
    readonlyBlock: {
      marginBottom: 12
    },
    readonlyLabel: {
      color: c.muted,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 6
    },
    readonlyValue: {
      color: c.text,
      fontSize: 15,
      fontWeight: '600',
      backgroundColor: c.cardAlt,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
    cancelWrap: {
      alignItems: 'center',
      paddingVertical: 12
    },
    cancel: {
      color: c.muted,
      fontWeight: '600'
    }
  });
}
