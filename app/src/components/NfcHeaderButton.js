// The tag reminder, sized to sit inside a screen's coloured header bar.
//
// Parth: "can you move the TAG floating to top bar?" It used to float on the
// right edge, where it sat on top of the Time Clock card on Home and risked
// covering payment tiles elsewhere. Living in the header means it never
// overlaps content on any screen.
//
// Reading is ambient — this does not start a scan. It says the option exists,
// says where to hold the tag, and offers to switch NFC on when it is off.
import { Text, StyleSheet, Pressable } from 'react-native';
import { colors, radius } from '../lib/theme';
import { useNfc } from './NfcProvider';

export default function NfcHeaderButton() {
  const { supported, hint } = useNfc();
  // Nothing to advertise on a device with no NFC radio (e.g. a Galaxy Tab).
  if (!supported) return null;
  return (
    <Pressable style={styles.btn} onPress={hint} hitSlop={12}>
      <Text style={styles.txt}>📶 TAG</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.xl,
  },
  txt: { color: colors.white, fontSize: 17, fontWeight: '900' },
});
