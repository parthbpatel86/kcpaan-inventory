// A scroll container that keeps the field you are typing in visible.
//
// Parth: "Whenever I am typing in any text/number field, I cannot see the
// actual field as the keyboard covers it." Android does not do this for you
// inside a ScrollView, so every screen with a TextInput must wrap its content
// here rather than in a bare ScrollView.
//
// - KeyboardAvoidingView lifts the content above the keyboard.
// - keyboardShouldPersistTaps="handled" lets a button be tapped while the
//   keyboard is open, instead of the first tap only dismissing it.
// - The generous bottom padding means the last field can always scroll clear
//   of the keyboard.
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing } from '../lib/theme';

export default function KeyboardScreen({ children, contentStyle, ...rest }) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  // Enough room for the tallest Android keyboard plus a comfortable margin.
  content: { padding: spacing.lg, paddingBottom: 340 },
});
