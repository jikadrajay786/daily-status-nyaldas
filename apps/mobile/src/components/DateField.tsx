import { fmtDate } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { ymd } from '@daily-status/core/workdays'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { CalendarDays } from 'lucide-react-native'
import { Platform } from 'react-native'
import { withUniwind } from 'uniwind'
import { useTheme } from '@/lib/theme'
import { HStack } from './gs/hstack'
import { Pressable } from './gs/pressable'
import { Text } from './gs/text'
import { VStack } from './gs/vstack'
import { Link } from './ui'

const CalendarIcon = withUniwind(CalendarDays)
const DatePicker = withUniwind(DateTimePicker)

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
  const { colors } = useTheme()
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
    <VStack className="gap-1.5">
      {!hideLabel && <Text className="text-[14px] font-medium text-fg-2">{title}</Text>}
      <HStack className="flex-wrap items-center gap-3">
        {Platform.OS === 'ios' && value ? (
          // iOS can follow the app's language; Android's dialog always uses the phone's.
          <DatePicker
            accessibilityLabel={title}
            value={toDate(value)}
            mode="date"
            display="compact"
            {...bounds}
            locale={locale}
            accentColorClassName="accent-accent"
            // Light or dark chrome for the native picker: a setting, not a colour.
            themeVariant={colors.scheme}
            onValueChange={(_e, d) => onChange(ymd(d))}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}: ${value ? fmtDate(value, locale) : t('allDates')}`}
            onPress={() => (Platform.OS === 'ios' ? onChange(today()) : openAndroid())}
            className="min-h-12 grow flex-row items-center gap-2.5 rounded-[10px] border border-line bg-field px-3"
          >
            <CalendarIcon size={18} colorClassName="accent-fg-2" />
            <Text className="text-[16px] text-fg">
              {value ? fmtDate(value, locale) : t('allDates')}
            </Text>
          </Pressable>
        )}
        {clearable && value && <Link onPress={() => onChange('')}>{t('allDates')}</Link>}
      </HStack>
    </VStack>
  )
}
