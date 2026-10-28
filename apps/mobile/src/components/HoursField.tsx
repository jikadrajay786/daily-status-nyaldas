import { useT } from '@daily-status/core/i18n'
import { Minus, Plus } from 'lucide-react-native'
import { TextInput } from 'react-native'
import { withUniwind } from 'uniwind'
import { useAnnounce } from '@/lib/announce'
import { parseHours } from '@/lib/hours'
import { HStack } from './gs/hstack'
import { Pressable } from './gs/pressable'
import { Text } from './gs/text'
import { VStack } from './gs/vstack'

const MinusIcon = withUniwind(Minus)
const PlusIcon = withUniwind(Plus)

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
  useAnnounce(error)
  const n = parseHours(value)
  const btn = (
    Icon: typeof MinusIcon,
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
      className={`h-12 w-12 items-center justify-center rounded-[10px] border border-line bg-field data-[active=true]:bg-selected ${disabled ? 'opacity-40' : ''}`}
    >
      <Icon size={20} colorClassName="accent-fg" />
    </Pressable>
  )

  return (
    <VStack className="gap-1.5">
      <HStack className="flex-wrap items-center gap-2">
        <Text className="grow text-[16px] font-medium text-fg">{t('hoursWorked')}</Text>
        {btn(MinusIcon, t('hoursLess'), -1, n <= 0)}
        <TextInput
          accessibilityLabel={t('hoursWorked')}
          {...(error && { accessibilityHint: error })}
          value={value}
          onChangeText={onChange}
          {...(onFocus && { onFocus })}
          keyboardType="decimal-pad"
          selectTextOnFocus
          selectionColorClassName="accent-accent-fg"
          className={`min-h-12 w-[72px] rounded-[10px] border bg-field text-center text-[18px] font-semibold text-fg ${error ? 'border-bad' : 'border-line'}`}
        />
        {btn(PlusIcon, t('hoursMore'), 1, n >= 24)}
      </HStack>
      {error && (
        <Text accessibilityLiveRegion="polite" className="text-[13px] text-bad-fg">
          {error}
        </Text>
      )}
    </VStack>
  )
}
