import { nameOf } from '@daily-status/core/format'
import { unlockMessage } from '@daily-status/core/appLock'
import { LANG_LIST, LANGS, useT, type Key } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import * as N from 'expo-notifications'
import { Check } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native'
import { Button, Card, Link, Notice, Screen, Segmented, Title } from '@/components/ui'
import { askToUnlock, checkSupport, setLockOn, useLockOn, type Support } from '@/lib/appLock'
import { useProfile } from '@/lib/profile'
import { setReminderOn, setReminderTime, useReminder } from '@/lib/reminder'
import { PALETTES, THEMES, useTheme, type Theme } from '@/lib/theme'

const THEME_TEXT: Record<Theme, readonly [Key, Key]> = {
  system: ['themePhone', 'themePhoneHint'],
  light: ['themeLight', 'themeLightHint'],
  dark: ['themeDark', 'themeDarkHint'],
  midnight: ['themeMidnight', 'themeMidnightHint'],
  cyberpunk: ['themeCyberpunk', 'themeCyberpunkHint'],
  sepia: ['themeSepia', 'themeSepiaHint']
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
      <Section title={t('reminder')}>
        <Reminder />
      </Section>
      <Section title={t('lockSection')}>
        <AppLockSetting />
      </Section>
      <Button variant="ghost" onPress={() => void db().auth.signOut()}>
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
}): React.JSX.Element => {
  const { colors: c } = useTheme()
  return (
    <View style={s.section}>
      <Text accessibilityRole="header" style={[s.heading, { color: c.fg2 }]}>
        {title}
      </Text>
      {children}
    </View>
  )
}

const Themes = (): React.JSX.Element => {
  const { t } = useT()
  const { theme: current, setTheme, colors: c } = useTheme()
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('theme')}
      style={[s.list, { backgroundColor: c.card, borderColor: c.line }]}
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
            style={({ pressed }) => [
              s.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
              (pressed || checked) && { backgroundColor: c.selected }
            ]}
          >
            <Swatch theme={theme} />
            <View style={s.grow}>
              <Text style={[s.name, { color: c.fg }]}>{t(name)}</Text>
              <Text style={[s.hint, { color: c.fg3 }]}>{t(hint)}</Text>
            </View>
            {checked && <Check size={22} color={c.accentFg} />}
          </Pressable>
        )
      })}
    </View>
  )
}

// A tiny preview: the theme's background with its accent, split light/dark for "Match my phone".
const Swatch = ({ theme }: { theme: Theme }): React.JSX.Element => {
  const { colors: c } = useTheme()
  const sides = theme === 'system' ? [PALETTES.light, PALETTES.dark] : [PALETTES[theme]]
  return (
    <View style={[s.swatch, { borderColor: c.line }]}>
      {sides.map((p) => (
        <View key={p.canvas} style={[s.side, { backgroundColor: p.canvas }]}>
          <View style={[s.dot, { backgroundColor: p.accent }]} />
        </View>
      ))}
    </View>
  )
}

const AppLockSetting = (): React.JSX.Element => {
  const { t } = useT()
  const { colors: c } = useTheme()
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
      <View style={s.switchRow}>
        <View style={s.grow}>
          <Text style={[s.name, { color: c.fg }]}>{t('lockToggle', { method })}</Text>
          <Text style={[s.hint, { color: c.fg3 }]}>{t('lockToggleHint', { method })}</Text>
        </View>
        <Switch
          accessibilityLabel={t('lockToggle', { method })}
          accessibilityHint={t('lockToggleHint', { method })}
          // Always switchable off, even if Face ID was removed meanwhile.
          disabled={busy || (!on && !usable)}
          value={on}
          onValueChange={(v) => void toggle(v)}
          trackColor={{ false: c.line, true: c.accent }}
          thumbColor={Platform.OS === 'android' ? (on ? c.onAccent : c.fg3) : undefined}
          ios_backgroundColor={c.line}
        />
      </View>
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
  const { colors: c } = useTheme()
  const { on, time } = useReminder()
  const [allowed, setAllowed] = useState(true)

  // Re-checked on return, since the fix for a blocked reminder is in the phone's settings.
  useEffect(() => {
    const check = (): void => void N.getPermissionsAsync().then((p) => setAllowed(p.granted))
    check()
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check())
    return () => sub.remove()
  }, [])

  const toggle = async (next: boolean): Promise<void> => {
    await setReminderOn(next)
    setAllowed((await N.getPermissionsAsync()).granted)
  }
  const label = toDate(time).toLocaleTimeString(locale, { timeStyle: 'short' })

  return (
    <Card>
      <View style={s.switchRow}>
        <View style={s.grow}>
          <Text style={[s.name, { color: c.fg }]}>{t('reminderSwitch')}</Text>
          <Text style={[s.hint, { color: c.fg3 }]}>{t('reminderHint')}</Text>
        </View>
        <Switch
          accessibilityLabel={t('reminderSwitch')}
          accessibilityHint={t('reminderHint')}
          value={on}
          onValueChange={(v) => void toggle(v)}
          trackColor={{ false: c.line, true: c.accent }}
          thumbColor={Platform.OS === 'android' ? (on ? c.onAccent : c.fg3) : undefined}
          ios_backgroundColor={c.line}
        />
      </View>
      {on && (
        <View style={s.switchRow}>
          <Text style={[s.name, s.grow, { color: c.fg }]}>{t('reminderTime')}</Text>
          {Platform.OS === 'ios' ? (
            // iOS can follow the app's language; Android's dialog always uses the phone's.
            <DateTimePicker
              value={toDate(time)}
              mode="time"
              display="compact"
              locale={locale}
              accentColor={c.accent}
              themeVariant={c.scheme}
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
              style={[s.time, { backgroundColor: c.field, borderColor: c.line }]}
            >
              <Text style={[s.name, { color: c.fg }]}>{label}</Text>
            </Pressable>
          )}
        </View>
      )}
      {on && !allowed && (
        <>
          <Notice tone="warn">{t('reminderBlocked')}</Notice>
          <Link onPress={() => void Linking.openSettings()}>{t('openPhoneSettings')}</Link>
        </>
      )}
    </Card>
  )
}

const s = StyleSheet.create({
  section: { gap: 8 },
  heading: { fontSize: 13, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, padding: 14 },
  grow: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '500' },
  hint: { fontSize: 13 },
  swatch: {
    flexDirection: 'row',
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden'
  },
  side: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  time: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14
  }
})
