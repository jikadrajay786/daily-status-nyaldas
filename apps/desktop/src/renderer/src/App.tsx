import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarPage } from './components/CalendarPage'
import { DesktopAlerts } from './components/DesktopAlerts'
import { DetailsProvider } from './components/Details'
import { AdminDashboard } from './components/AdminDashboard'
import { AppearanceSettings } from './components/AppearanceSettings'
import { HomePage, type Focus } from './components/HomePage'
import { AuthScreen } from './components/AuthScreen'
import { Logo } from './components/Logo'
import { AppSkeleton } from './components/Skeletons'
import { Sidebar } from './components/Sidebar'
import { StatusHistory } from './components/StatusHistory'
import { LeaveRequests } from './components/Leave/LeaveRequests'
import { MyLeave } from './components/Leave/MyLeave'
import { MyTasks } from './components/Tasks/MyTasks'
import { TaskBoard } from './components/Tasks/TaskBoard'
import { Button, Notice } from './components/ui'
import { UserSubmission } from './components/UserSubmission'
import type { Profile } from '@daily-status/core/database.types'
import { I18nContext, LOCALE, translator, useT, type I18n } from '@daily-status/core/i18n'
import { initialLang, saveLang } from './lib/lang'
import { canSee, home, type View } from './lib/nav'
import { db, today } from '@daily-status/core/supabase'
import { supabase } from './lib/supabase'
import { useAuth } from '@daily-status/core/useAuth'
import { useBusy } from '@daily-status/core/useBusy'
import { useRealtimeSync } from '@daily-status/core/live'

const Splash = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <main className="grid min-h-screen place-items-center bg-canvas p-6 text-fg">
    <div className="flex max-w-sm flex-col items-center gap-4 text-center">{children}</div>
  </main>
)

const Workspace = ({ profile }: { profile: Profile }): React.JSX.Element => {
  const [view, setView] = useState<View>(() => home(profile.role))
  // What Home asked the next page to show; any other navigation clears it.
  const [focus, setFocus] = useState<Focus>({})
  const go = (v: View, f: Focus = {}): void => {
    setView(v)
    setFocus(f)
  }
  useRealtimeSync(profile.id)
  // `edit` is the update to open in the form (History and Recent's Edit buttons), or `new` to add another.
  const [day, setDay] = useState(() => ({ date: today(), edit: null as string | null }))
  // Falls back if the role changes mid-session; RLS is what actually hides team data.
  const active = canSee(view, profile.role) ? view : home(profile.role)

  const page = ((): React.JSX.Element => {
    switch (active) {
      case 'home':
        return <HomePage me={profile} onOpen={go} />
      case 'today':
        return (
          <UserSubmission
            profile={profile}
            date={day.date}
            editing={day.edit}
            onChange={(date, edit) => setDay({ date, edit })}
          />
        )
      case 'history':
        return (
          <StatusHistory
            profile={profile}
            onEdit={(d, id) => {
              setDay({ date: d, edit: id ?? null })
              go('today')
            }}
          />
        )
      case 'tasks':
        return <MyTasks profile={profile} />
      case 'leave':
        return <MyLeave profile={profile} />
      case 'team':
        return <AdminDashboard me={profile} open={focus.person} />
      case 'leaveRequests':
        return <LeaveRequests me={profile} />
      case 'taskBoard':
        return <TaskBoard profile={profile} view={focus.taskView} />
      case 'calendar':
        return <CalendarPage profile={profile} />
      case 'appearance':
        return <AppearanceSettings />
      default:
        return active satisfies never
    }
  })()

  return (
    <DetailsProvider me={profile}>
      <DesktopAlerts userId={profile.id} onOpenPage={go} />
      <div className="flex h-screen bg-canvas text-fg">
        <Sidebar view={active} profile={profile} onNavigate={go} />
        <main className="flex-1 overflow-y-auto [scroll-padding-top:14rem] [scrollbar-gutter:stable]">
          <div
            key={active}
            className={`mx-auto animate-fade p-8 ${active === 'calendar' ? 'max-w-7xl' : 'max-w-5xl'}`}
          >
            {page}
          </div>
        </main>
      </div>
    </DetailsProvider>
  )
}

const Main = (): React.JSX.Element => {
  const { t } = useT()
  const auth = useAuth()
  const [leaving, leave] = useBusy()
  switch (auth.state) {
    case 'loading':
      return <AppSkeleton />
    case 'signed-out':
      return <AuthScreen />
    case 'error':
      return (
        <Splash>
          <Notice tone="bad">{t(auth.message)}</Notice>
          <div className="flex gap-2">
            <Button onClick={auth.retry}>{t('tryAgain')}</Button>
            <Button
              variant="ghost"
              busy={leaving}
              onClick={() => void leave(() => db().auth.signOut({ scope: 'local' }))}
            >
              {t('signOut')}
            </Button>
          </div>
        </Splash>
      )
    case 'waiting':
      return (
        <Splash>
          <Logo />
          <h1 className="text-xl font-semibold">
            {t(auth.declined ? 'declinedTitle' : 'waitingTitle')}
          </h1>
          <p className="text-fg-2">
            {auth.declined ? t('declinedHint') : t('waitingHint', { email: auth.email })}
          </p>
          <div className="flex gap-2">
            <Button onClick={auth.retry}>{t('checkAgain')}</Button>
            <Button
              variant="ghost"
              busy={leaving}
              onClick={() => void leave(() => db().auth.signOut({ scope: 'local' }))}
            >
              {t('signOut')}
            </Button>
          </div>
        </Splash>
      )
    case 'signed-in':
      return <Workspace key={auth.profile.id} profile={auth.profile} />
    default:
      return auth satisfies never
  }
}

function App(): React.JSX.Element {
  const [lang, setLang] = useState(initialLang)
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
  // Chromium picks Devanagari/Gujarati fallback fonts and screen-reader voices from <html lang>.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <I18nContext value={i18n}>
      {supabase ? (
        <Main />
      ) : (
        <Splash>
          {/* Developer-only setup screen, so it stays in English. */}
          <Notice tone="warn">
            Supabase isn&apos;t configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
            in .env, then restart npm run dev.
          </Notice>
        </Splash>
      )}
    </I18nContext>
  )
}

export default App
