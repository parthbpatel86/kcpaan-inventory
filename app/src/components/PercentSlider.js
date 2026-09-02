// Whole-percent slider, 1..max.
//
// Parth: "a nice slider from 1 to 8 %". Built with PanResponder rather than a
// native slider package: the tree is on RN 0.85 / Expo 56 and adding one hit a
// peer-dependency conflict, which is not worth risking on a working POS.
//
// Sized for the people who actually use it — a 64pt track and a 52pt thumb, and
// the whole track is tappable, so nobody has to hit a small handle. Values snap
// to whole percentages; there is no such thing as 4.7% off at this counter.
import { useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import { colors, radius } from '../lib/theme';

const THUMB = 52;

export default function PercentSlider({ value, min = 1, max = 8, onChange }) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  function pick(x) {
    const w = widthRef.current;
    if (w <= 0) return;
    const usable = Math.max(1, w - THUMB);
    const ratio = Math.min(1, Math.max(0, (x - THUMB / 2) / usable));
    const next = Math.round(min + ratio * (max - min));
    if (next !== value) onChange(next);
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => pick(e.nativeEvent.locationX),
      onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
    })
  ).current;

  const span = Math.max(1, max - min);
  const pct = (value - min) / span;
  const left = pct * Math.max(0, width - THUMB);

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        widthRef.current = w;
        setWidth(w);
      }}
      {...pan.panHandlers}
    >
      <View style={styles.track} />
      <View style={[styles.fill, { width: left + THUMB / 2 }]} />
      <View style={[styles.thumb, { left }]}>
        <Text style={styles.thumbTxt}>{value}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 64, justifyContent: 'center' },
  track: {
    position: 'absolute', left: 0, right: 0, height: 16,
    borderRadius: 8, backgroundColor: colors.border,
  },
  fill: {
    position: 'absolute', left: 0, height: 16,
    borderRadius: 8, backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.white,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.3,
    shadowRadius: 3, shadowOffset: { width: 0, height: 2 },
  },
  thumbTxt: { color: colors.white, fontSize: 17, fontWeight: '900' },
});
