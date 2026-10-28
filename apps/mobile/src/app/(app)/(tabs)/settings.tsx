import { useBusy } from '@daily-status/core/useBusy'
import { nameOf } from '@daily-status/core/format'
import { unlockMessage } from '@daily-status/core/appLock'
import { LANG_LIST, LANGS, useT, type Key } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import * as N from 'expo-notifications'
import { Check } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { AppState, Linking, Platform, Switch } from 'react-native'
import { withUniwind } from 'uniwind'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Pressable } from '@/components/gs/pressable'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { Badge, Button, Card, Link, Notice, Screen, Segmented, Title } from '@/components/ui'
import { askToUnlock, checkSupport, setLockOn, useLockOn, type Support } from '@/lib/appLock'
import { useProfile } from '@/lib/profile'
import {
  allowExact,
  exactAllowed,
  setReminderOn,
  setReminderTime,
  useNextReminder,
  useReminder
} from '@/lib/reminder'
import {
  ACCENT_COLORS,
  ACCENTS,
  PALETTES,
  THEMES,
  useTheme,
  withAccent,
  type Accent,
  type Theme
} from '@/lib/theme'

// Their colour props (color, accentColor) take theme classes through *ColorClassName.
const CheckIcon = withUniwind(Check)
const TimePicker = withUniwind(DateTimePicker)

const THEME_TEXT: Record<Theme, readonly [Key, Key]> = {
  system: ['themePhone', 'themePhoneHint'],
  light: ['themeLight', 'themeLightHint'],
  dark: ['themeDark', 'themeDarkHint'],
  midnight: ['themeMidnight', 'themeMidnightHint']
}
const ACCENT_TEXT: Record<Accent, Key> = {
  indigo: 'accentIndigo',
  emerald: 'accentEmerald',
  blue: 'accentBlue',
  purple: 'accentPurple',
  amber: 'accentAmber',
  cyan: 'accentCyan'
}

const toDate = (time: string): Date => {
  const [h = 17, m = 30] = time.split(':').map(Number)
  return new Date(2000, 0, 1, h, m)
}
const toTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export default function Settings(): React.JSX.Element {
  const { t, lang, setLang } = useT()
  const profile = useProfile()
  const [leaving, leave] = useBusy()
  return (
    <Screen>
      <Title sub={profile.email ?? undefined}>{nameOf(profile)}</Title>
      <Section title={t('language')}>
        <Segmented
          label={t('language')}
          options={LANG_LIST.map((l) => [l, LANGS[l]] as const)}
          value={lang}
          onChange={setLang}
        />
      </Section>
      <Section title={t('theme')}>
        <Themes />
      </Section>
      <Section title={t('accentColour')}>
        <Accents />
      </Section>
      {profile.role !== 'admin' && (
        <Section title={t('reminder')}>
          <Reminder />
        </Section>
      )}
      <Section title={t('lockSection')}>
        <AppLockSetting />
      </Section>
      <Button variant="ghost" busy={leaving} onPress={() => void leave(() => db().auth.signOut())}>
        {t('signOut')}
      </Button>
    </Screen>
  )
}

const Section = ({
  title,
  children
}: {
  title: string
  children: ReactNode
}): React.JSX.Element => (
  <VStack className="gap-2">
    <Text
      accessibilityRole="header"
      className="text-[13px] font-semibold uppercase tracking-[0.8px] text-fg-2"
    >
      {title}
    </Text>
    {children}
  </VStack>
)

const Themes = (): React.JSX.Element => {
  const { t } = useT()
  const { theme: current, setTheme } = useTheme()
  return (
    <VStack
      accessibilityRole="radiogroup"
      accessibilityLabel={t('theme')}
      className="overflow-hidden rounded-[14px] border border-line bg-card"
    >
      {THEMES.map((theme, i) => {
        const [name, hint] = THEME_TEXT[theme]
        const checked = theme === current
        return (
          <Pressable
            key={theme}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            accessibilityLabel={t(name)}
            accessibilityHint={t(hint)}
            onPress={() => setTheme(theme)}
            className={`min-h-16 flex-row items-center gap-3.5 p-3.5 data-[active=true]:bg-selected ${i > 0 ? 'border-t-[length:hairlineWidth()] border-line' : ''} ${checked ? 'bg-selected' : ''}`}
          >
            <Swatch theme={theme} />
            <VStack className="flex-1 gap-0.5">
              <Text className="text-[16px] font-medium text-fg">{t(name)}</Text>
              <Text className="text-[13px] text-fg-3">{t(hint)}</Text>
            </VStack>
            {checked && <CheckIcon size={22} colorClassName="accent-accent-fg" />}
          </Pressable>
        )
      })}
    </VStack>
  )
}

const Accents = (): React.JSX.Element => {
  const { t } = useT()
  const { accent: current, setAccent, colors } = useTheme()
  return (
    <VStack className="gap-4">
      <Text className="text-[14px] text-fg-2">{t('accentHint')}</Text>
      <HStack
        accessibilityRole="radiogroup"
        accessibilityLabel={t('accentColour')}
        className="flex-wrap gap-2"
      >
        {ACCENTS.map((accent) => {
          const checked = accent === current
          const c = ACCENT_COLORS[accent][colors.scheme]
          return (
            <Pressable
              key={accent}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityLabel={t(ACCENT_TEXT[accent])}
              onPress={() => setAccent(accent)}
              className={`min-h-12 flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 data-[active=true]:bg-selected ${checked ? 'border-accent-fg bg-selected' : 'border-line bg-card'}`}
            >
              {/* Another accent's colour, not the active one's, so it is data rather than a class. */}
              <Box
                className="h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: c.accent }}
              >
                {checked && <Check size={18} color={c.onAccent} />}
              </Box>
              <Text
                className={`text-[15px] ${checked ? 'font-semibold android:font-bold text-fg' : 'text-fg-2'}`}
              >
                {t(ACCENT_TEXT[accent])}
              </Text>
            </Pressable>
          )
        })}
      </HStack>
      <Preview />
    </VStack>
  )
}

// Drawn with the live tokens, so it changes the moment a theme or colour is picked.
const Preview = (): React.JSX.Element => {
  const { t } = useT()
  return (
    <VStack
      accessible
      accessibilityLabel={t('preview')}
      className="gap-3 rounded-[14px] border border-line bg-canvas p-4"
    >
      <VStack className="gap-1.5 rounded-[12px] border border-line bg-card p-4">
        <HStack className="flex-wrap items-center justify-between gap-2">
          <Text className="text-[16px] font-semibold android:font-bold text-fg">
            {t('previewTitle')}
          </Text>
          <Badge label={t('stateDone')} tone="ok" />
        </HStack>
        <Text className="text-[14px] text-fg-2">{t('previewBody')}</Text>
      </VStack>
      <HStack className="items-center justify-between gap-3">
        <Box className="rounded-[10px] bg-accent px-4 py-2.5">
          <Text className="text-[15px] font-semibold android:font-bold text-on-accent">
            {t('submit')}
          </Text>
        </Box>
        <Text className="text-[14px] text-fg-2">
          {t('streak')}{' '}
          <Text className="text-[20px] font-bold tabular-nums text-accent-fg">12</Text>
        </Text>
      </HStack>
    </VStack>
  )
}

// A tiny preview: the theme's background with its accent, split light/dark for "Match my phone".
// Its colours are another theme's, not the active one's, so they stay data from PALETTES.
const Swatch = ({ theme }: { theme: Theme }): React.JSX.Element => {
  const { accent } = useTheme()
  const sides = (theme === 'system' ? [PALETTES.light, PALETTES.dark] : [PALETTES[theme]]).map(
    (p) => withAccent(p, accent)
  )
  return (
    <HStack className="h-11 w-11 overflow-hidden rounded-[10px] border border-line">
      {sides.map((p) => (
        <Box
          key={p.canvas}
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: p.canvas }}
        >
          <Box className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: p.accent }} />
        </Box>
      ))}
    </HStack>
  )
}

// Theme-coloured on both platforms; Android also tints the thumb, which iOS keeps white.
const Toggle = ({
  on,
  ...props
}: Omit<React.ComponentProps<typeof Switch>, 'value'> & { on: boolean }): React.JSX.Element => (
  <Switch
    value={on}
    trackColorOnClassName="accent-accent"
    trackColorOffClassName="accent-line"
    ios_backgroundColorClassName="accent-line"
    thumbColorClassName={
      Platform.OS === 'android' ? (on ? 'accent-on-accent' : 'accent-fg-3') : undefined
    }
    {...props}
  />
)

// A label and hint beside a control, at least 48pt tall.
const SwitchRow = ({
  name,
  hint,
  children
}: {
  name: string
  hint: string
  children: ReactNode
}): React.JSX.Element => (
  <HStack className="min-h-12 items-center gap-3">
    <VStack className="flex-1 gap-0.5">
      <Text className="text-[16px] font-medium text-fg">{name}</Text>
      <Text className="text-[13px] text-fg-3">{hint}</Text>
    </VStack>
    {children}
  </HStack>
)

const AppLockSetting = (): React.JSX.Element => {
  const { t } = useT()
  const { id } = useProfile()
  const on = useLockOn(id)
  const [support, setSupport] = useState<Support | null>(null)
  const [message, setMessage] = useState<Key | null>(null)
  const [busy, setBusy] = useState(false)
  const usable = !!support?.hardware && support.enrolled
  const method = t(support?.method ?? 'methodFaceId')

  // Re-checked on return, since Face ID and fingerprints are set up in the phone's Settings app.
  useEffect(() => {
    const check = (): void => void checkSupport().then(setSupport, () => setSupport(null))
    check()
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check())
    return () => sub.remove()
  }, [])

  // Turning it on needs a successful scan first, so nobody can switch on a lock they can't open. Turning it off
  // needs none: the app is already open, and it only removes protection the person chose.
  const toggle = async (next: boolean): Promise<void> => {
    setMessage(null)
    if (!next) return setLockOn(id, false)
    setBusy(true)
    try {
      const res = await askToUnlock(t, t('lockConfirm', { method }))
      if (res.success) setLockOn(id, true)
      else setMessage(unlockMessage(res.error))
    } catch {
      setMessage('lockFailed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <SwitchRow name={t('lockToggle', { method })} hint={t('lockToggleHint', { method })}>
        <Toggle
          accessibilityLabel={t('lockToggle', { method })}
          accessibilityHint={t('lockToggleHint', { method })}
          // Always switchable off, even if Face ID was removed meanwhile.
          disabled={busy || (!on && !usable)}
          on={on}
          onValueChange={(v) => void toggle(v)}
        />
      </SwitchRow>
      {support && !support.hardware && <Notice>{t('lockNoHardware')}</Notice>}
      {support?.hardware && !support.enrolled && (
        <Notice>{t('lockNotEnrolled', { method })}</Notice>
      )}
      {message && <Notice tone="bad">{t(message, { method })}</Notice>}
    </Card>
  )
}

const Reminder = (): React.JSX.Element => {
  const { t, locale } = useT()
  const { colors } = useTheme()
  const { on, time } = useReminder()
  const next = useNextReminder()
  const [allowed, setAllowed] = useState(true)
  const [exact, setExact] = useState(true)

  // Re-checked on return, since the fix for a blocked or late reminder is in the phone's settings.
  useEffect(() => {
    const check = (): void => {
      void N.getPermissionsAsync().then((p) => setAllowed(p.granted))
      void exactAllowed().then(setExact)
    }
    check()
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check())
    return () => sub.remove()
  }, [])

  const toggle = async (next: boolean): Promise<void> => {
    await setReminderOn(next)
    setAllowed((await N.getPermissionsAsync()).granted)
    setExact(await exactAllowed())
  }
  const label = toDate(time).toLocaleTimeString(locale, { timeStyle: 'short' })

  return (
    <Card>
      <SwitchRow name={t('reminderSwitch')} hint={t('reminderHint')}>
        <Toggle
          accessibilityLabel={t('reminderSwitch')}
          accessibilityHint={t('reminderHint')}
          on={on}
          onValueChange={(v) => void toggle(v)}
        />
      </SwitchRow>
      {on && (
        <HStack className="min-h-12 items-center gap-3">
          <Text className="flex-1 text-[16px] font-medium text-fg">{t('reminderTime')}</Text>
          {Platform.OS === 'ios' ? (
            // iOS can follow the app's language; Android's dialog always uses the phone's.
            <TimePicker
              value={toDate(time)}
              mode="time"
              display="compact"
              locale={locale}
              accentColorClassName="accent-accent"
              // Light or dark chrome for the native picker: a setting, not a colour.
              themeVariant={colors.scheme}
              onValueChange={(_e, d) => setReminderTime(toTime(d))}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('reminderTime')}: ${label}`}
              onPress={() =>
                DateTimePickerAndroid.open({
                  value: toDate(time),
                  mode: 'time',
                  onValueChange: (_e, d) => setReminderTime(toTime(d))
                })
              }
              className="min-h-12 justify-center rounded-[10px] border border-line bg-field px-3.5"
            >
              <Text className="text-[16px] font-medium text-fg">{label}</Text>
            </Pressable>
          )}
        </HStack>
      )}
      {on && allowed && next !== null && (
        <Text className="text-[14px] text-fg-2">
          {t('reminderNext', {
            when: new Date(next).toLocaleString(locale, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit'
            })
          })}
        </Text>
      )}
      {on && !allowed && (
        <>
          <Notice tone="warn">{t('reminderBlocked')}</Notice>
          <Link onPress={() => void Linking.openSettings()}>{t('openPhoneSettings')}</Link>
        </>
      )}
      {on && allowed && !exact && (
        <>
          <Notice tone="warn">{t('reminderLate')}</Notice>
          <Link onPress={() => void allowExact().then(setExact)}>{t('reminderAllowExact')}</Link>
        </>
      )}
    </Card>
  )
}
