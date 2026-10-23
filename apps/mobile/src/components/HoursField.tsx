import { useT } from '@daily-status/core/i18n'
import { Minus, Plus, type LucideIcon } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAnnounce } from '@/lib/announce'
import { parseHours } from '@/lib/hours'
import { useTheme } from '@/lib/theme'

type Props = { value: string; onChange: (h: string) => void; error?: string; onFocus?: () => void }

// − and + move to the next half hour (7.3 → 7.5 or 7); the box still takes typed values like 7.25.
const step = (raw: string, dir: 1 | -1): string => {
  const n = parseHours(raw)
  const half = Number.isNaN(n) ? 16 : n * 2
  return String(
    Math.min(24, Math.max(0, (dir > 0 ? Math.floor(half + 1) : Math.ceil(half - 1)) / 2))
  )
}

export const HoursField = ({ value, onChange, error, onFocus }: Props): React.JSX.Element => {
  const { t } = useT()
  const { colors: c } = useTheme()
  useAnnounce(error)
  const n = parseHours(value)
  const btn = (
    Icon: LucideIcon,
    label: string,
    dir: 1 | -1,
    disabled: boolean
  ): React.JSX.Element => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onChange(step(value, dir))}
      style={({ pressed }) => [
        s.step,
        { borderColor: c.line, backgroundColor: pressed ? c.selected : c.field },
        disabled && s.dim
      ]}
    >
      <Icon size={20} color={c.fg} />
    </Pressable>
  )

  return (
    <View style={s.field}>
      <View style={s.row}>
        <Text style={[s.label, { color: c.fg }]}>{t('hoursWorked')}</Text>
        {btn(Minus, t('hoursLess'), -1, n <= 0)}
        <TextInput
          accessibilityLabel={t('hoursWorked')}
          {...(error && { accessibilityHint: error })}
          value={value}
          onChangeText={onChange}
          {...(onFocus && { onFocus })}
          keyboardType="decimal-pad"
          selectTextOnFocus
          selectionColor={c.accentFg}
          style={[
            s.input,
            { backgroundColor: c.field, borderColor: error ? c.bad : c.line, color: c.fg }
          ]}
        />
        {btn(Plus, t('hoursMore'), 1, n >= 24)}
      </View>
      {error && (
        <Text accessibilityLiveRegion="polite" style={[s.error, { color: c.badFg }]}>
          {error}
        </Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  field: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  label: { flexGrow: 1, fontSize: 16, fontWeight: '500' },
  step: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dim: { opacity: 0.4 },
  input: {
    width: 72,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center'
  },
  error: { fontSize: 13 }
})
