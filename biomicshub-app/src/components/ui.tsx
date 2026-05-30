import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '@/src/theme/ThemeContext';
import { darkColors, ThemeColors } from '@/src/theme/theme';

// Backwards-compatible static export (dark values). Prefer useTheme() in new code.
export const palette = darkColors;

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          marginBottom: 14
        },
        style
      ]}
    >
      {children}
    </View>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 }}>{children}</Text>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: colors.accent,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 6
      }}
    >
      {children}
    </Text>
  );
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'success' | 'warn' }) {
  const { colors } = useTheme();
  const bg = tone === 'success' ? colors.badgeSuccessBg : tone === 'warn' ? colors.badgeWarnBg : colors.badgeBg;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginRight: 6,
        marginBottom: 6
      }}
    >
      <Text style={{ color: colors.badgeText, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = 'solid'
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'outline';
}) {
  const { colors } = useTheme();
  const outline = variant === 'outline';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: outline ? 'transparent' : colors.accent,
          borderWidth: outline ? 1 : 0,
          borderColor: colors.accent,
          borderRadius: 12,
          paddingVertical: 14,
          alignItems: 'center'
        },
        disabled && { opacity: 0.5 },
        pressed && !disabled && { opacity: 0.85 }
      ]}
    >
      <Text style={{ color: outline ? colors.accent : colors.accentText, fontWeight: '800', fontSize: 15 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  autoCapitalize = 'none',
  placeholder
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  placeholder?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={{ color: colors.muted, marginBottom: 6, fontSize: 13 }}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={{
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          color: colors.text,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16
        }}
      />
    </View>
  );
}

export function PasswordField({
  label,
  value,
  onChangeText,
  placeholder
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  const [visible, setVisible] = React.useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={{ color: colors.muted, marginBottom: 6, fontSize: 13 }}>{label}</Text> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 14
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={{ flex: 1, color: colors.text, paddingVertical: 12, fontSize: 16 }}
        />
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10}>
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

export function SelectField({
  label,
  value,
  placeholder,
  options,
  onChange
}: {
  label: string;
  value: string;
  placeholder?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={{ color: colors.muted, marginBottom: 6, fontSize: 13 }}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12
        }}
      >
        <Text style={{ flex: 1, color: selected ? colors.text : colors.muted, fontSize: 16 }}>
          {selected?.label || placeholder || 'Select an option'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={selectStyles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[selectStyles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={[selectStyles.sheetTitle, { color: colors.text }]}>{label || 'Select'}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={[
                      selectStyles.option,
                      { borderBottomColor: colors.border },
                      active && { backgroundColor: colors.accentSoft }
                    ]}
                  >
                    <Text style={{ color: active ? colors.accent : colors.text, fontWeight: active ? '700' : '500' }}>
                      {option.label}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function formatBirthDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DateField({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = React.useState(false);
  const parsed = value ? new Date(`${value}T12:00:00`) : new Date(2005, 0, 1);
  const display = value
    ? parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed' || !selected) return;
    onChange(formatBirthDate(selected));
  }

  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={{ color: colors.muted, marginBottom: 6, fontSize: 13 }}>{label}</Text> : null}
      <Pressable
        onPress={() => setShowPicker(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.accent} />
        <Text style={{ flex: 1, marginLeft: 10, color: display ? colors.text : colors.muted, fontSize: 16 }}>
          {display || placeholder || 'Select date'}
        </Text>
      </Pressable>
      {showPicker ? (
        Platform.OS === 'ios' ? (
          <Modal visible transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
            <Pressable style={selectStyles.backdrop} onPress={() => setShowPicker(false)}>
              <Pressable style={[selectStyles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
                <View style={selectStyles.iosPickerHeader}>
                  <Pressable onPress={() => setShowPicker(false)}>
                    <Text style={{ color: colors.accent, fontWeight: '700' }}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={Number.isNaN(parsed.getTime()) ? new Date(2005, 0, 1) : parsed}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={onPickerChange}
                />
              </Pressable>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker
            value={Number.isNaN(parsed.getTime()) ? new Date(2005, 0, 1) : parsed}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={onPickerChange}
          />
        )
      ) : null}
    </View>
  );
}

const selectStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 24 },
  sheetTitle: { fontSize: 16, fontWeight: '800', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  iosPickerHeader: { alignItems: 'flex-end', paddingHorizontal: 18, paddingTop: 12 }
});

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 }}>
      <ActivityIndicator color={colors.accent} />
      <Text style={{ color: colors.muted }}>{label}</Text>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      style={{
        backgroundColor: colors.errorBg,
        borderColor: colors.danger,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12
      }}
    >
      <Text style={{ color: colors.errorText }}>{message}</Text>
    </View>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      style={{
        backgroundColor: colors.successBg,
        borderColor: colors.success,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12
      }}
    >
      <Text style={{ color: colors.successText }}>{message}</Text>
    </View>
  );
}

function inr(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value / 100);
}

export function PriceRow({
  label,
  salePaise,
  mrpPaise,
  validityDays
}: {
  label: string;
  salePaise: number;
  mrpPaise: number;
  validityDays?: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createPriceStyles(colors), [colors]);
  const isFree = salePaise <= 0 && mrpPaise <= 0;
  return (
    <View style={styles.priceRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.priceLabel}>{label}</Text>
        {validityDays ? <Text style={styles.priceMeta}>{validityDays} days access</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {isFree ? (
          <Text style={styles.priceSale}>Free</Text>
        ) : (
          <>
            {mrpPaise > salePaise ? <Text style={styles.priceMrp}>{inr(mrpPaise)}</Text> : null}
            <Text style={styles.priceSale}>{inr(salePaise)}</Text>
          </>
        )}
      </View>
    </View>
  );
}

function createPriceStyles(c: ThemeColors) {
  return StyleSheet.create({
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.border
    },
    priceLabel: { color: c.text, fontSize: 15, fontWeight: '600' },
    priceMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
    priceMrp: { color: c.muted, textDecorationLine: 'line-through', fontSize: 12 },
    priceSale: { color: c.accent, fontSize: 17, fontWeight: '800' }
  });
}
