import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, fonts, radius, space } from '@/theme';

// ------------------------------------------------------------------ texto

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[s.title, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, style, muted }: { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean }) {
  return <Text style={[s.body, muted && { color: colors.muted }, style]}>{children}</Text>;
}

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.label, style]}>{children}</Text>;
}

// ---------------------------------------------------------------- pantalla

export function Screen({
  children,
  scroll,
  edges = ['top', 'bottom'],
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={[s.pad, style]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[s.pad, { flex: 1 }, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

// ------------------------------------------------------------------ botones

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Botón con respuesta al pulsar (escala 0,97 en 120 ms). */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [pressed, setPressed] = useState(false);
  const off = disabled || loading;
  const v = variants[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={style}
    >
      <Animated.View
        style={[
          s.btn,
          { backgroundColor: v.bg, borderColor: v.border },
          off && { opacity: 0.5 },
          { transform: [{ scale: pressed ? 0.97 : 1 }], transitionProperty: 'transform', transitionDuration: 120 },
        ]}
      >
        {loading ? <ActivityIndicator color={v.fg} /> : icon}
        <Text style={[s.btnText, { color: v.fg }]}>{title}</Text>
      </Animated.View>
    </Pressable>
  );
}

const variants: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.gold, fg: colors.goldInk, border: colors.gold },
  secondary: { bg: colors.surface2, fg: colors.text, border: colors.line },
  ghost: { bg: 'transparent', fg: colors.text, border: colors.line },
  danger: { bg: 'transparent', fg: colors.danger, border: '#5A2E2A' },
};

// ------------------------------------------------------------------ chips

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      hitSlop={4}
      style={[s.chip, selected && s.chipOn]}
    >
      {icon}
      <Text style={[s.chipText, selected && { color: colors.goldInk }]}>{label}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------------ campos

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: space(2) }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.faint}
        selectionColor={colors.gold}
        {...props}
        onFocus={(e) => {
          setFocus(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          props.onBlur?.(e);
        }}
        style={[s.input, focus && { borderColor: colors.gold }, !!error && { borderColor: colors.danger }, props.style]}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Text style={s.error} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Loading({ text }: { text?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator color={colors.gold} size="large" />
      {text ? <Body muted style={{ textAlign: 'center', marginTop: space(4) }}>{text}</Body> : null}
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space(5), paddingVertical: space(4), gap: space(4) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6), backgroundColor: colors.bg },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.text, letterSpacing: -0.5 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  btn: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space(5),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
  },
  btnText: { fontFamily: fonts.bold, fontSize: 16 },
  chip: {
    minHeight: 40,
    paddingHorizontal: space(4),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
  },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 17,
  },
  error: { fontFamily: fonts.medium, fontSize: 14, color: colors.danger },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space(4),
    gap: space(3),
  },
});
