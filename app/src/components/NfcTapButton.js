// Small always-there reminder that a tag can be tapped.
//
// Parth: "have a small button on all screen to help scan it except manager
// screens." Reading is ambient, so this button does not start a scan — it tells
// staff the option exists, says where to hold the tag, and offers to switch NFC
// on if the radio is off.
//
// Sits on the right edge, vertically centred: every screen keeps its primary
// controls at the top or the bottom (POS cart bar, confirm payment tiles), so
// this is the one place that never covers something that matters.
import { Text, StyleSheet, Pressable } from 'react-native';
import { usePathname } from 'expo-router';
import { colors, radius, shadow } from '../lib/theme';
import { useNfc } from './NfcProvider';

// Manager-only screens. Staff never see these, and a manager doing inventory
// does not need a clock-in prompt on top of the numbers.
const MANAGER_ROUTES = [
  '/manager', '/stock', '/timesheet', '/shift',
  '/reports', '/history', '/settings', '/enroll-face',
];

export default function NfcTapButton() {
  const pathname = usePathname() || '/';
  const { supported, hint } = useNfc();

  if (MANAGER_ROUTES.some((r) => pathname.startsWith(r))) return null;
  // Nothing to advertise on a device with no NFC radio.
  if (!supported) return null;

  return (
    <Pressable style={styles.btn} onPress={hint} hitSlop={10}>
      <Text style={styles.icon}>📶</Text>
      <Text style={styles.label}>TAG</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute', right: 0, top: '44%',
    backgroundColor: colors.primary,
    paddingVertical: 12, paddingHorizontal: 10,
    borderTopLeftRadius: radius.md, borderBottomLeftRadius: radius.md,
    alignItems: 'center', opacity: 0.92,
    ...shadow.card,
  },
  icon: { fontSize: 22 },
  label: { color: colors.white, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
});
