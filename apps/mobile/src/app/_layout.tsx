import { supabase } from '@/lib/supabase'
// Registers its sign-in listener before anyone can sign in (see freshSignIn).
import '@/lib/appLock'
import { I18nContext, LOCALE, translator, useT, type I18n } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import { useAuth } from '@daily-status/core/useAuth'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import { useEffect, useMemo, useState } from 'react'
import { LogBox, useColorScheme } from 'react-native'
import { Button, Notice, Screen } from '@/components/ui'
import { initialLang, saveLang } from '@/lib/lang'
import { ProfileContext } from '@/lib/profile'
import { prefs } from '@/lib/storage'
import { isTheme, PALETTES, ThemeContext, type Theme, type ThemeCtx } from '@/lib/theme'

void SplashScreen.preventAutoHideAsync()

// Expo's DOM wrapper sends props on its first render, before the native WebView exists; the page loads its
// initial props separately, so nothing is lost. Dev-only noise.
LogBox.ignoreLogs([
  "Unable to find the 'DomWebView' view",
  "Call to function 'DomWebView.injectJavaScript'"
])

const Main = (): React.JSX.Element | null => {
  const { t } = useT()
  const auth = useAuth()
  const loading = auth.state === 'loading'
  useEffect(() => {
    if (!loading) SplashScreen.hide()
  }, [loading])

  if (loading) return null
  if (auth.state === 'error')
    return (
      <Screen center>
        <Notice tone="bad">{t(auth.message)}</Notice>
        <Button onPress={auth.retry}>{t('tryAgain')}</Button>
        <Button variant="ghost" onPress={() => void db().auth.signOut()}>
          {t('signOut')}
        </Button>
      </Screen>
    )
  const signedIn = auth.state === 'signed-in'
  return (
    <ProfileContext value={signedIn ? auth.profile : null}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </ProfileContext>
  )
}

export default function RootLayout(): React.JSX.Element {
  const [lang, setLang] = useState(initialLang)
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = prefs.get('theme')
    return isTheme(saved) ? saved : 'system'
  })
  const scheme = useColorScheme()
  const colors = PALETTES[theme === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : theme]

  const i18n = useMemo<I18n>(
    () => ({
      lang,
      locale: LOCALE[lang],
      t: translator(lang),
      setLang: (l) => {
        saveLang(l)
        setLang(l)
      }
    }),
    [lang]
  )
  const themeCtx = useMemo<ThemeCtx>(
    () => ({
      theme,
      colors,
      setTheme: (t) => {
        prefs.set('theme', t)
        setTheme(t)
      }
    }),
    [theme, colors]
  )
  // Navigation chrome (headers, tab bar, screen transitions) takes its colours from the active palette.
  const navTheme = useMemo(() => {
    const base = colors.scheme === 'dark' ? DarkTheme : DefaultTheme
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accentFg,
        background: colors.canvas,
        card: colors.card,
        text: colors.fg,
        border: colors.line,
        notification: colors.bad
      }
    }
  }, [colors])

  // The root view shows through during keyboard and rotation animations, so it must match the canvas.
  useEffect(() => void SystemUI.setBackgroundColorAsync(colors.canvas), [colors.canvas])
  useEffect(() => {
    if (!supabase) SplashScreen.hide()
  }, [])

  return (
    <I18nContext value={i18n}>
      <ThemeContext value={themeCtx}>
        <ThemeProvider value={navTheme}>
          <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
          {supabase ? (
            <Main />
          ) : (
            <Screen center>
              {/* Developer-only setup screen, so it stays in English. */}
              <Notice tone="warn">
                Supabase isn&apos;t configured. Set EXPO_PUBLIC_SUPABASE_URL and
                EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env, then restart Metro.
              </Notice>
            </Screen>
          )}
        </ThemeProvider>
      </ThemeContext>
    </I18nContext>
  )
}
