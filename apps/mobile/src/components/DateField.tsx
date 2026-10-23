import { fmtDate } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { ymd } from '@daily-status/core/workdays'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { CalendarDays } from 'lucide-react-native'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'
import { Link } from './ui'

// Local midnight, never toISOString(): in IST that would land on the previous day.
const toDate = (d: string): Date => new Date(`${d}T00:00`)

type Props = {
  value: string
  onChange: (d: string) => void
  label?: string
  min?: string
  max?: string
  // Empty means "all dates" (the team feed's filter); phones have no date box to clear.
  clearable?: boolean
  // Still read by screen readers; for places where the date speaks for itself.
  hideLabel?: boolean
}

export const DateField = ({
  value,
  onChange,
  label,
  min,
  max,
  clearable = false,
  hideLabel = false
}: Props): React.JSX.Element => {
  const { t, locale } = useT()
  const { colors: c } = useTheme()
  const title = label ?? t('date')
  const bounds = { maximumDate: toDate(max ?? today()), ...(min && { minimumDate: toDate(min) }) }
  const openAndroid = (): void =>
    DateTimePickerAndroid.open({
      value: toDate(value || today()),
      mode: 'date',
      ...bounds,
      onValueChange: (_e, d) => onChange(ymd(d))
    })

  return (
    <View style={s.field}>
      {!hideLabel && <Text style={[s.label, { color: c.fg2 }]}>{title}</Text>}
      <View style={s.row}>
        {Platform.OS === 'ios' && value ? (
          // iOS can follow the app's language; Android's dialog always uses the phone's.
          <DateTimePicker
            accessibilityLabel={title}
            value={toDate(value)}
            mode="date"
            display="compact"
            {...bounds}
            locale={locale}
            accentColor={c.accent}
            themeVariant={c.scheme}
            onValueChange={(_e, d) => onChange(ymd(d))}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}: ${value ? fmtDate(value, locale) : t('allDates')}`}
            onPress={() => (Platform.OS === 'ios' ? onChange(today()) : openAndroid())}
            style={[s.button, { backgroundColor: c.field, borderColor: c.line }]}
          >
            <CalendarDays size={18} color={c.fg2} />
            <Text style={[s.value, { color: c.fg }]}>
              {value ? fmtDate(value, locale) : t('allDates')}
            </Text>
          </Pressable>
        )}
        {clearable && value && <Link onPress={() => onChange('')}>{t('allDates')}</Link>}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  button: {
    flexGrow: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  value: { fontSize: 16 }
})
