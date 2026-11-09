import { useBusy } from '@daily-status/core/useBusy'
import { initials, nameOf, ROLE_KEY, ROLE_TONE } from '@daily-status/core/format'
import { unlockMessage } from '@daily-status/core/appLock'
import { LANG_LIST, LANGS, useT, type Key } from '@daily-status/core/i18n'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import Constants from 'expo-constants'
import * as N from 'expo-notifications'
import { router } from 'expo-router'
import {
  Bell,
  ChevronRight,
  Clock,
  Fingerprint,
  LogOut,
  Palette,
  ScanFace
} from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { AppState, Linking, Platform, Switch } from 'react-native'
import { withUniwind } from 'uniwind'
import { Section } from '@/components/AppearanceSettings'
import { HStack } from '@/components/gs/hstack'
import { Pressable } from '@/components/gs/pressable'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Link,
  Notice,
  Screen,
  Segmented,
  Title
} from '@/components/ui'
import { askToUnlock, checkSupport, setLockOn, useLockOn, type Support } from '@/lib/appLock'
import { useProfile } from '@/lib/profile'
import { signOut } from '@/lib/push'
import {
  allowExact,
  exactAllowed,
  setReminderOn,
  setReminderTime,
  useNextReminder,
  useReminder
} from '@/lib/reminder'
import { ACCENT_TEXT, THEME_TEXT, useTheme } from '@/lib/theme'

// Their colour props (accentColor) take theme classes through *ColorClassName.
const TimePicker = withUniwind(DateTimePicker)
const NextIcon = withUniwind(ChevronRight)
const LeaveIcon = withUniwind(LogOut)
const BellIcon = withUniwind(Bell)
const ClockIcon = withUniwind(Clock)
const PaletteIcon = withUniwind(Palette)
const FingerIcon = withUniwind(Fingerprint)
const FaceIcon = withUniwind(ScanFace)

// One card's worth of settings rows: the rows draw their own spacing and dividers.
const ROWS = 'gap-0 py-1'

// An icon and label beside a control, at least 48pt tall.
const Row = ({
  icon,
  name,
  hint,
  first = false,
  children
}: {
  icon: ReactNode
  name: string
  hint?: string | undefined
  first?: boolean
  children?: ReactNode
}): React.JSX.Element => (
  <HStack
    className={`min-h-14 items-center gap-3 py-2.5 ${first ? '' : 'border-t-[length:hairlineWidth()] border-line'}`}
  >
    {icon}
    <VStack className="flex-1 gap-0.5">
      <Text className="text-[16px] font-medium text-fg">{name}</Text>
      {hint && <Text className="text-[13px] text-fg-3">{hint}</Text>}
    </VStack>
    {children}
  </HStack>
)

const toDate = (time: string): Date => {
  const [h = 17, m = 30] = time.split(':').map(Number)
  return new Date(2000, 0, 1, h, m)
}
const toTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export default function Settings(): React.JSX.Element {
  const { t, lang, setLang } = useT()
  const profile = useProfile()
  const version = Constants.expoConfig?.version
  return (
    <Screen header={<Title>{t('navSettings')}</Title>}>
      <Card>
        <HStack className="items-center gap-3">
          <Avatar text={initials(profile)} />
          <VStack className="flex-1 gap-0.5">
            <Text numberOfLines={1} className="text-[16px] font-semibold text-fg android:font-bold">
              {nameOf(profile)}
            </Text>
            {profile.email && (
              <Text numberOfLines={1} className="text-[13px] text-fg-3">
                {profile.email}
              </Text>
            )}
          </VStack>
          <Badge label={t(ROLE_KEY[profile.role])} tone={ROLE_TONE[profile.role]} />
        </HStack>
      </Card>
      {profile.role !== 'admin' && (
        <Section title={t('reminder')}>
          <Reminder />
        </Section>
      )}
      <Section title={t('language')}>
        <Segmented
          label={t('language')}
          options={LANG_LIST.map((l) => [l, LANGS[l]] as const)}
          value={lang}
          onChange={setLang}
        />
      </Section>
      <Section title={t('settingsApp')}>
        <Card className={ROWS}>
          <AppearanceRow />
          <AppLockSetting />
        </Card>
      </Section>
      <SignOut />
      {version && (
        <Text className="text-center text-[13px] text-fg-3">{t('appVersion', { v: version })}</Text>
      )}
    </Screen>
  )
}

const AppearanceRow = (): React.JSX.Element => {
  const { t } = useT()
  const { theme, accent } = useTheme()
  const now = `${t(THEME_TEXT[theme][0])} · ${t(ACCENT_TEXT[accent])}`
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('navAppearance')}: ${now}`}
      onPress={() => router.push('/appearance')}
      className="data-[active=true]:opacity-70"
    >
      <Row
        icon={<PaletteIcon colorClassName="accent-fg-2" size={20} />}
        name={t('navAppearance')}
        hint={now}
        first
      >
        <NextIcon colorClassName="accent-fg-3" size={20} />
      </Row>
    </Pressable>
  )
}

// Asks first, in the app's own language: signing out means typing the password again.
const SignOut = (): React.JSX.Element => {
  const { t } = useT()
  const [confirming, setConfirming] = useState(false)
  const [leaving, leave] = useBusy()
  return confirming ? (
    <Card>
      <Text className="text-[15px] text-fg">{t('signOutConfirm')}</Text>
      <HStack className="flex-wrap gap-2">
        <Button variant="danger" busy={leaving} onPress={() => void leave(signOut)}>
          {t('signOut')}
        </Button>
        <Button variant="ghost" onPress={() => setConfirming(false)}>
          {t('cancel')}
        </Button>
      </HStack>
    </Card>
  ) : (
    <Pressable
      accessibilityRole="button"
      onPress={() => setConfirming(true)}
      className="mt-2 min-h-12 flex-row items-center justify-center gap-2 rounded-[14px] border border-line bg-card data-[active=true]:bg-selected"
    >
      <LeaveIcon colorClassName="accent-bad-fg" size={18} />
      <Text className="text-[16px] font-medium text-bad-fg">{t('signOut')}</Text>
    </Pressable>
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
    <>
      <Row
        icon={
          support?.method === 'methodFingerprint' ? (
            <FingerIcon colorClassName="accent-fg-2" size={20} />
          ) : (
            <FaceIcon colorClassName="accent-fg-2" size={20} />
          )
        }
        name={t('lockToggle', { method })}
        hint={t('lockToggleHint', { method })}
      >
        <Toggle
          accessibilityLabel={t('lockToggle', { method })}
          accessibilityHint={t('lockToggleHint', { method })}
          // Always switchable off, even if Face ID was removed meanwhile.
          disabled={busy || (!on && !usable)}
          on={on}
          onValueChange={(v) => void toggle(v)}
        />
      </Row>
      {support && !support.hardware && <Notice>{t('lockNoHardware')}</Notice>}
      {support?.hardware && !support.enrolled && (
        <Notice>{t('lockNotEnrolled', { method })}</Notice>
      )}
      {message && <Notice tone="bad">{t(message, { method })}</Notice>}
    </>
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
    <Card className={ROWS}>
      <Row
        icon={<BellIcon colorClassName="accent-fg-2" size={20} />}
        name={t('reminderSwitch')}
        hint={t('reminderHint')}
        first
      >
        <Toggle
          accessibilityLabel={t('reminderSwitch')}
          accessibilityHint={t('reminderHint')}
          on={on}
          onValueChange={(v) => void toggle(v)}
        />
      </Row>
      {on && (
        <Row
          icon={<ClockIcon colorClassName="accent-fg-2" size={20} />}
          name={t('reminderTime')}
          hint={
            allowed && next !== null
              ? t('reminderNext', {
                  when: new Date(next).toLocaleString(locale, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit'
                  })
                })
              : undefined
          }
        >
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
        </Row>
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
