// Manager timesheet — review punches for a pay period, fix flagged rows.
//
// The clock (punch.js) is deliberately dumb: staff only press IN / OUT. When a
// shift is left open or someone punches OUT with no matching IN, the server
// stores a flag ('MISSING_OUT' / 'MISSING_IN') instead of guessing. This screen
// is where a manager repairs those rows by hand, and every edit is written to
// the punch audit log so the correction is traceable.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Modal, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';

export default function Timesheet() {
  const router = useRouter();
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState(null); // null = All
  const [monthOffset, setMonthOffset] = useState(0);  // 0 = current month, -1 = last month
  const [half, setHalf] = useState(firstHalfOfMonth() ? 1 : 2);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const period = periodDates(monthOffset, half);

  useEffect(() => {
    api.listEmployees().then(setEmployees).catch(() => {});
  }, []);

  useEffect(() => { loadRows(); }, [employeeId, monthOffset, half]);

  function loadRows() {
    setLoading(true);
    const parts = [`start=${period.start}`, `end=${period.end}`];
    if (employeeId != null) parts.unshift(`employee_id=${employeeId}`);
    api.timesheet(`?${parts.join('&')}`)
      .then((r) => setRows(Array.isArray(r) ? r : (r && r.rows) || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  function toggleAudit() {
    const next = !showAudit;
    setShowAudit(next);
    if (next && audit.length === 0) {
      setAuditLoading(true);
      api.punchAudit()
        .then((r) => setAudit(Array.isArray(r) ? r : (r && r.rows) || []))
        .catch(() => setAudit([]))
        .finally(() => setAuditLoading(false));
    }
  }

  function openEdit(row) {
    setEditing({
      id: row.id,
      name: employeeName(row, employees),
      punchIn: row.punch_in || '',
      punchOut: row.punch_out || '',
      note: row.note || '',
      flag: row.flag || null,
      clearFlag: false,
    });
  }

  async function saveEdit() {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await api.updatePunch(editing.id, {
        punch_in: editing.punchIn.trim() || null,
        punch_out: editing.punchOut.trim() || null,
        flag: editing.clearFlag ? null : editing.flag,
        note: editing.note.trim(),
        changed_by: 'manager',
      });
      setEditing(null);
      setAudit([]);
      loadRows();
    } catch (e) {
      Alert.alert('Could not save', String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  const totalHours = rows.reduce((sum, r) => sum + (hoursOf(r) || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Timesheet</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl * 2 }}>
        <Text style={styles.sectionTitle}>Employee</Text>
        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, employeeId == null && styles.chipOn]}
            onPress={() => setEmployeeId(null)}
          >
            <Text style={[styles.chipText, employeeId == null && styles.chipTextOn]}>All</Text>
          </Pressable>
          {employees.map((e) => (
            <Pressable
              key={e.id}
              style={[styles.chip, employeeId === e.id && styles.chipOn]}
              onPress={() => setEmployeeId(e.id)}
            >
              <Text style={[styles.chipText, employeeId === e.id && styles.chipTextOn]}>{e.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Period</Text>
        <View style={styles.monthRow}>
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
        </View>
        <View style={styles.halfRow}>
          <Pressable style={[styles.halfBtn, half === 1 && styles.halfBtnOn]} onPress={() => setHalf(1)}>
            <Text style={[styles.halfText, half === 1 && styles.halfTextOn]}>1–15</Text>
          </Pressable>
          <Pressable style={[styles.halfBtn, half === 2 && styles.halfBtnOn]} onPress={() => setHalf(2)}>
            <Text style={[styles.halfText, half === 2 && styles.halfTextOn]}>16–end</Text>
          </Pressable>
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>
            {employeeId == null ? 'All staff' : employeeName({ employee_id: employeeId }, employees)}
            {'  ·  '}{period.start} → {period.end}
          </Text>
          <Text style={styles.totalValue}>{totalHours.toFixed(2)} hrs</Text>
          <Text style={styles.totalSub}>{rows.length} punch {rows.length === 1 ? 'row' : 'rows'}</Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No punches in this period.</Text>
        ) : (
          rows.map((r) => {
            const h = hoursOf(r);
            return (
              <Pressable key={r.id} style={[styles.row, r.flag && styles.rowFlagged]} onPress={() => openEdit(r)}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName}>{employeeName(r, employees)}</Text>
                  {r.flag ? (
                    <View style={[styles.badge, { backgroundColor: r.flag === 'MISSING_IN' ? colors.order : colors.low }]}>
                      <Text style={styles.badgeText}>{r.flag.replace('_', ' ')}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.rowTimes}>
                  <View style={styles.timeCell}>
                    <Text style={styles.timeLabel}>IN</Text>
                    <Text style={styles.timeValue}>{r.punch_in || '—'}</Text>
                  </View>
                  <View style={styles.timeCell}>
                    <Text style={styles.timeLabel}>OUT</Text>
                    <Text style={styles.timeValue}>{r.punch_out || '—'}</Text>
                  </View>
                  <View style={styles.timeCell}>
                    <Text style={styles.timeLabel}>HOURS</Text>
                    <Text style={[styles.timeValue, styles.hoursValue]}>{h == null ? '—' : h.toFixed(2)}</Text>
                  </View>
                </View>
                {r.note ? <Text style={styles.rowNote}>📝 {r.note}</Text> : null}
              </Pressable>
            );
          })
        )}

        <Pressable style={styles.auditToggle} onPress={toggleAudit}>
          <Text style={styles.auditToggleText}>{showAudit ? '▾' : '▸'}  Audit log</Text>
        </Pressable>
        {showAudit && (
          auditLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : audit.length === 0 ? (
            <Text style={styles.empty}>No manager edits recorded.</Text>
          ) : (
            audit.map((a, i) => (
              <View key={a.id != null ? a.id : i} style={styles.auditRow}>
                <Text style={styles.auditField}>{a.field}</Text>
                <Text style={styles.auditChange}>
                  {a.old_value == null || a.old_value === '' ? '—' : String(a.old_value)}
                  {'  →  '}
                  {a.new_value == null || a.new_value === '' ? '—' : String(a.new_value)}
                </Text>
                <Text style={styles.auditMeta}>{a.changed_by || 'unknown'} · {a.changed_at || ''}</Text>
              </View>
            ))
          )
        )}
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Fix punch</Text>
            <Text style={styles.modalSub}>{editing ? editing.name : ''}</Text>

            <Text style={styles.fieldLabel}>Punch IN (YYYY-MM-DD HH:MM:SS)</Text>
            <TextInput
              style={styles.input}
              value={editing ? editing.punchIn : ''}
              onChangeText={(v) => setEditing({ ...editing, punchIn: v })}
              placeholder="2026-08-14 09:00:00"
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Punch OUT (YYYY-MM-DD HH:MM:SS)</Text>
            <TextInput
              style={styles.input}
              value={editing ? editing.punchOut : ''}
              onChangeText={(v) => setEditing({ ...editing, punchOut: v })}
              placeholder="2026-08-14 17:30:00"
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Note (why was this changed?)</Text>
            <TextInput
              style={[styles.input, styles.inputNote]}
              value={editing ? editing.note : ''}
              onChangeText={(v) => setEditing({ ...editing, note: v })}
              placeholder="Forgot to punch out"
              placeholderTextColor={colors.textLight}
              multiline
            />

            {editing && editing.flag ? (
              <Pressable
                style={styles.checkRow}
                onPress={() => setEditing({ ...editing, clearFlag: !editing.clearFlag })}
              >
                <View style={[styles.checkBox, editing.clearFlag && styles.checkBoxOn]}>
                  <Text style={styles.checkMark}>{editing.clearFlag ? '✓' : ''}</Text>
                </View>
                <Text style={styles.checkLabel}>Clear flag ({editing.flag.replace('_', ' ')})</Text>
              </Pressable>
            ) : null}

            <View style={styles.modalBtnRow}>
              <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setEditing(null)}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.5 }]}
                onPress={saveEdit}
                disabled={saving}
              >
                <Text style={styles.modalBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function firstHalfOfMonth() {
  return new Date().getDate() <= 15;
}

// monthOffset 0 = this month, -1 = last month. half 1 = 1–15, 2 = 16–end.
function periodDates(monthOffset, half) {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const y = base.getFullYear();
  const m = base.getMonth();
  if (half === 1) {
    return { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m, 15)) };
  }
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { start: ymd(new Date(y, m, 16)), end: ymd(new Date(y, m, lastDay)) };
}

function monthLabel(monthOffset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function employeeName(row, employees) {
  if (row && row.employee_name) return row.employee_name;
  if (row && row.name) return row.name;
  const match = employees.find((e) => e.id === (row && row.employee_id));
  return match ? match.name : 'Unknown';
}

// "YYYY-MM-DD HH:MM:SS" — parsed manually so it is read as local time on both
// iOS and Android instead of being treated as UTC.
function parseStamp(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
}

function hoursOf(row) {
  if (typeof row.hours === 'number') return row.hours;
  const a = parseStamp(row.punch_in);
  const b = parseStamp(row.punch_out);
  if (!a || !b) return null;
  const h = (b.getTime() - a.getTime()) / 3600000;
  return h > 0 ? h : null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: spacing.lg, marginBottom: spacing.lg },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 2, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, fontWeight: '800', color: colors.text },
  chipTextOn: { color: colors.white },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  stepBtn: { paddingHorizontal: spacing.md },
  stepBtnOff: { opacity: 0.3 },
  stepText: { fontSize: 26, fontWeight: '800', color: colors.primary },
  stepTextOff: { color: colors.textLight },
  monthLabel: { fontSize: 16, fontWeight: '800', color: colors.text },

  halfRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  halfBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, paddingVertical: spacing.md, alignItems: 'center' },
  halfBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  halfText: { fontSize: 16, fontWeight: '800', color: colors.text },
  halfTextOn: { color: colors.white },

  totalCard: { backgroundColor: colors.primaryLight, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg, ...shadow.card },
  totalLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  totalValue: { fontSize: 34, fontWeight: '900', color: colors.primaryDark, marginTop: spacing.xs },
  totalSub: { fontSize: 13, fontWeight: '700', color: colors.textMuted },

  row: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, padding: spacing.md, marginTop: spacing.md, ...shadow.card },
  rowFlagged: { borderColor: colors.order, backgroundColor: '#FFF6F5' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowName: { fontSize: 17, fontWeight: '800', color: colors.text },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  rowTimes: { flexDirection: 'row', marginTop: spacing.sm },
  timeCell: { flex: 1 },
  timeLabel: { fontSize: 11, fontWeight: '800', color: colors.textLight, letterSpacing: 0.5 },
  timeValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  hoursValue: { color: colors.primaryDark },
  rowNote: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },

  auditToggle: { marginTop: spacing.xl, paddingVertical: spacing.md },
  auditToggleText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  auditRow: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  auditField: { fontSize: 12, fontWeight: '900', color: colors.textMuted, letterSpacing: 0.5 },
  auditChange: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  auditMeta: { fontSize: 12, color: colors.textLight, marginTop: 2 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(28,38,32,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl },
  modalTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  modalSub: { fontSize: 15, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.text },
  inputNote: { minHeight: 64, textAlignVertical: 'top' },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  checkBox: { width: 28, height: 28, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: colors.healthy, borderColor: colors.healthy },
  checkMark: { color: colors.white, fontSize: 17, fontWeight: '900' },
  checkLabel: { fontSize: 15, fontWeight: '700', color: colors.text },

  modalBtnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  modalBtn: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.border },
  modalBtnGhostText: { fontSize: 16, fontWeight: '800', color: colors.text },
  modalBtnText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
