// Manager timesheet — one tab per staff member, one row per day worked.
//
// Parth's corrections after testing:
//   - "no one is going to type the entire date and time and seconds" -> the
//     edit dialog uses a calendar + a clock picker (AM/PM). Seconds are never
//     shown or entered.
//   - "The view looks very wordy" -> horizontal tabs by staff, then a compact
//     table (Date | In | Out | Hrs). The total is PER STAFF for the selected
//     range; there is no combined "all staff" figure.
//
// The clock itself (punch.js) stays dumb: staff only press IN / OUT. When a
// shift is left open, or someone punches OUT with no matching IN, the server
// flags it ('MISSING_OUT' / 'MISSING_IN') instead of guessing — this screen is
// where a manager repairs it, and every edit goes to the punch audit log.
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';

export default function Timesheet() {
  const router = useRouter();
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [half, setHalf] = useState(firstHalfOfMonth() ? 1 : 2);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(null); // {field:'in'|'out', mode:'date'|'time'}

  const period = periodDates(monthOffset, half);

  useEffect(() => {
    api.listEmployees()
      .then((e) => {
        const list = Array.isArray(e) ? e : [];
        setEmployees(list);
        // Default to the first person — the screen is per-staff, not combined.
        if (list.length) setEmployeeId((prev) => (prev == null ? list[0].id : prev));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (employeeId != null) loadRows();
  }, [employeeId, monthOffset, half]);

  function loadRows() {
    setLoading(true);
    api.timesheet(`?employee_id=${employeeId}&start=${period.start}&end=${period.end}`)
      .then((r) => setRows(Array.isArray(r) ? r : (r && r.rows) || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  function openEdit(row) {
    setEditing({
      id: row.id,
      inDate: parseStamp(row.punch_in) || defaultStart(),
      outDate: parseStamp(row.punch_out),
      flag: row.flag || null,
      clearFlag: !!row.flag,
    });
  }

  async function saveEdit() {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await api.updatePunch(editing.id, {
        punch_in: editing.inDate ? sqlStamp(editing.inDate) : null,
        punch_out: editing.outDate ? sqlStamp(editing.outDate) : null,
        flag: editing.clearFlag ? null : editing.flag,
        changed_by: 'manager',
      });
      setEditing(null);
      loadRows();
    } catch (e) {
      Alert.alert('Could not save', String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  function onPicked(event, date) {
    const p = picker;
    setPicker(null);
    // Android reports a cancel as type 'dismissed'.
    if (!date || !p || (event && event.type === 'dismissed')) return;
    setEditing((prev) => {
      if (!prev) return prev;
      const key = p.field === 'in' ? 'inDate' : 'outDate';
      const base = prev[key] || prev.inDate || new Date();
      const next = new Date(base);
      if (p.mode === 'date') {
        next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      } else {
        next.setHours(date.getHours(), date.getMinutes(), 0, 0);
      }
      return { ...prev, [key]: next };
    });
  }

  const total = rows.reduce((s, r) => s + (hoursOf(r) || 0), 0);
  const who = employees.find((e) => e.id === employeeId);
  const hasFlags = rows.some((r) => r.flag);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Timesheet</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* One tab per staff member */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarInner}
      >
        {employees.length === 0 && <Text style={styles.muted}>No staff yet.</Text>}
        {employees.map((e) => (
          <Pressable
            key={e.id}
            style={[styles.tab, employeeId === e.id && styles.tabOn]}
            onPress={() => setEmployeeId(e.id)}
          >
            <Text style={[styles.tabText, employeeId === e.id && styles.tabTextOn]}>{e.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Period: month stepper + half-month */}
      <View style={styles.periodBar}>
        <Pressable style={styles.stepBtn} onPress={() => setMonthOffset(monthOffset - 1)} hitSlop={8}>
          <Text style={styles.stepText}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel(monthOffset)}</Text>
        <Pressable
          style={[styles.stepBtn, monthOffset >= 0 && styles.stepBtnOff]}
          onPress={() => monthOffset < 0 && setMonthOffset(monthOffset + 1)}
          hitSlop={8}
        >
          <Text style={[styles.stepText, monthOffset >= 0 && styles.stepTextOff]}>›</Text>
        </Pressable>
        <Pressable style={[styles.halfBtn, half === 1 && styles.halfBtnOn]} onPress={() => setHalf(1)}>
          <Text style={[styles.halfText, half === 1 && styles.halfTextOn]}>1–15</Text>
        </Pressable>
        <Pressable style={[styles.halfBtn, half === 2 && styles.halfBtnOn]} onPress={() => setHalf(2)}>
          <Text style={[styles.halfText, half === 2 && styles.halfTextOn]}>16–end</Text>
        </Pressable>
      </View>

      {/* Per-staff total for the selected range */}
      <View style={styles.totalCard}>
        <Text style={styles.totalName}>{who ? who.name : '—'}</Text>
        <Text style={styles.totalValue}>{total.toFixed(2)} hrs</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl * 2 }}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 1.2 }]}>Date</Text>
            <Text style={[styles.th, { flex: 1 }]}>In</Text>
            <Text style={[styles.th, { flex: 1 }]}>Out</Text>
            <Text style={[styles.th, { flex: 0.8, textAlign: 'right' }]}>Hrs</Text>
          </View>

          {rows.length === 0 ? (
            <Text style={styles.empty}>No punches in this period.</Text>
          ) : (
            rows.map((r) => {
              const h = hoursOf(r);
              return (
                <Pressable
                  key={r.id}
                  style={[styles.tr, r.flag && styles.trFlagged]}
                  onPress={() => openEdit(r)}
                >
                  <Text style={[styles.td, { flex: 1.2, fontWeight: '700' }]}>{dayLabel(r)}</Text>
                  <Text style={[styles.td, { flex: 1 }]}>{hhmm(r.punch_in)}</Text>
                  <Text style={[styles.td, { flex: 1 }]}>{hhmm(r.punch_out)}</Text>
                  <Text style={[styles.td, { flex: 0.8, textAlign: 'right', fontWeight: '800' }]}>
                    {h != null ? h.toFixed(2) : '—'}
                  </Text>
                </Pressable>
              );
            })
          )}

          {hasFlags && <Text style={styles.fixHint}>⚠️ Red rows need a time — tap to fix.</Text>}
        </ScrollView>
      )}

      {/* Edit dialog: calendar + clock, never a typed timestamp */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBg}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Fix times</Text>
            {editing && editing.flag ? (
              <Text style={styles.sheetFlag}>
                {editing.flag === 'MISSING_IN'
                  ? 'No clock-in was recorded.'
                  : 'No clock-out was recorded.'}
              </Text>
            ) : null}

            <Text style={styles.pickLabel}>Clock in</Text>
            <View style={styles.pickRow}>
              <Pressable style={styles.pickBtn} onPress={() => setPicker({ field: 'in', mode: 'date' })}>
                <Text style={styles.pickBtnText}>
                  {editing && editing.inDate ? dateText(editing.inDate) : 'Set date'}
                </Text>
              </Pressable>
              <Pressable style={styles.pickBtn} onPress={() => setPicker({ field: 'in', mode: 'time' })}>
                <Text style={styles.pickBtnText}>
                  {editing && editing.inDate ? timeText(editing.inDate) : 'Set time'}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.pickLabel}>Clock out</Text>
            <View style={styles.pickRow}>
              <Pressable style={styles.pickBtn} onPress={() => setPicker({ field: 'out', mode: 'date' })}>
                <Text style={styles.pickBtnText}>
                  {editing && editing.outDate ? dateText(editing.outDate) : 'Set date'}
                </Text>
              </Pressable>
              <Pressable style={styles.pickBtn} onPress={() => setPicker({ field: 'out', mode: 'time' })}>
                <Text style={styles.pickBtnText}>
                  {editing && editing.outDate ? timeText(editing.outDate) : 'Set time'}
                </Text>
              </Pressable>
            </View>

            {editing && editing.inDate && editing.outDate ? (
              <Text style={styles.previewHours}>
                = {Math.max(0, (editing.outDate - editing.inDate) / 3600000).toFixed(2)} hrs
              </Text>
            ) : null}

            <Text style={styles.note}>This correction is recorded in the manager audit log.</Text>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={styles.cancel} onPress={() => setEditing(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.save, saving && { opacity: 0.5 }]}
                onPress={saveEdit}
                disabled={saving}
              >
                <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {picker && editing ? (
        <DateTimePicker
          value={(picker.field === 'in' ? editing.inDate : editing.outDate) || new Date()}
          mode={picker.mode}
          is24Hour={false}
          display="default"
          onChange={onPicked}
        />
      ) : null}
    </SafeAreaView>
  );
}

/* ---------------------------------------------------------------- helpers */

function pad(n) {
  return String(n).padStart(2, '0');
}

function firstHalfOfMonth() {
  return new Date().getDate() <= 15;
}

function periodDates(monthOffset, half) {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const y = base.getFullYear();
  const m = base.getMonth();
  const eom = new Date(y, m + 1, 0).getDate();
  return half === 1
    ? { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-15` }
    : { start: `${y}-${pad(m + 1)}-16`, end: `${y}-${pad(m + 1)}-${eom}` };
}

function monthLabel(monthOffset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

/** Server stamps may be ISO, or 'YYYY-MM-DD HH:MM:SS' with a space. */
function parseStamp(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

/** What the API expects back. Seconds are always :00 — we never collect them. */
function sqlStamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function defaultStart() {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d;
}

function dateText(d) {
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function timeText(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Table cell — time only, no seconds. */
function hhmm(v) {
  const d = parseStamp(v);
  return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
}

function dayLabel(row) {
  const d = parseStamp(row.punch_in) || parseStamp(row.punch_out);
  return d ? d.toLocaleDateString([], { weekday: 'short', day: 'numeric' }) : '—';
}

function hoursOf(row) {
  const a = parseStamp(row.punch_in);
  const b = parseStamp(row.punch_out);
  if (!a || !b) return null;
  return (b - a) / 3600000;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.instore, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 18, paddingHorizontal: spacing.sm },

  tabBar: { flexGrow: 0, backgroundColor: colors.surface },
  tabBarInner: { padding: spacing.sm, gap: spacing.sm },
  tab: {
    paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  tabOn: { backgroundColor: colors.primary },
  tabText: { fontWeight: '800', color: colors.textMuted, fontSize: 19 },
  tabTextOn: { color: colors.white },

  periodBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  stepBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnOff: { opacity: 0.35 },
  stepText: { fontSize: 22, fontWeight: '800', color: colors.text, lineHeight: 24 },
  stepTextOff: { color: colors.textLight },
  monthLabel: { flex: 1, fontSize: 19, fontWeight: '800', color: colors.text },
  halfBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  halfBtnOn: { backgroundColor: colors.primary },
  halfText: { fontWeight: '800', color: colors.textMuted, fontSize: 18 },
  halfTextOn: { color: colors.white },

  totalCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.card,
  },
  totalName: { fontSize: 20, fontWeight: '800', color: colors.text },
  totalValue: { fontSize: 26, fontWeight: '900', color: colors.primary },

  tableHead: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingBottom: 6 },
  th: { fontSize: 18, fontWeight: '800', color: colors.textMuted },
  tr: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    marginBottom: spacing.sm, ...shadow.card,
  },
  trFlagged: { borderLeftWidth: 5, borderLeftColor: colors.order },
  td: { fontSize: 19, color: colors.text },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  fixHint: {
    fontSize: 18, color: colors.order, fontWeight: '700',
    textAlign: 'center', marginTop: spacing.sm,
  },

  modalBg: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'center', padding: spacing.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  sheetFlag: { fontSize: 18, color: colors.order, fontWeight: '700' },
  pickLabel: { fontSize: 18, fontWeight: '800', color: colors.textMuted, marginTop: spacing.sm },
  pickRow: { flexDirection: 'row', gap: spacing.sm },
  pickBtn: {
    flex: 1, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  pickBtnText: { fontSize: 20, fontWeight: '800', color: colors.text },
  previewHours: {
    fontSize: 20, fontWeight: '800', color: colors.primary,
    textAlign: 'center', marginTop: spacing.sm,
  },
  note: { fontSize: 18, color: colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  cancel: {
    flex: 1, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt, alignItems: 'center',
  },
  cancelText: { fontWeight: '700', color: colors.textMuted },
  save: {
    flex: 1, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  saveText: { fontWeight: '800', color: colors.white },
});
