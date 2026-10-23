import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AdminDashboard } from './components/AdminDashboard'
import { AppearanceSettings } from './components/AppearanceSettings'
import { AuthScreen } from './components/AuthScreen'
import { AppSkeleton } from './components/Skeletons'
import { Sidebar } from './components/Sidebar'
import { StatusHistory } from './components/StatusHistory'
import { MyTasks } from './components/Tasks/MyTasks'
import { TaskBoard } from './components/Tasks/TaskBoard'
import { Button, Notice } from './components/ui'
import { UserSubmission } from './components/UserSubmission'
import type { Profile } from '@daily-status/core/database.types'
import { I18nContext, LOCALE, translator, useT, type I18n } from '@daily-status/core/i18n'
import { initialLang, saveLang } from './lib/lang'
import { canSee, type View } from './lib/nav'
import { db, today } from '@daily-status/core/supabase'
import { supabase } from './lib/supabase'
import { useAuth } from '@daily-status/core/useAuth'

const Splash = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <main className="grid min-h-screen place-items-center bg-canvas p-6 text-fg">
    <div className="flex max-w-sm flex-col items-center gap-4 text-center">{children}</div>
  </main>
)

const Workspace = ({ profile }: { profile: Profile }): React.JSX.Element => {
  const [view, setView] = useState<View>('today')
  const [date, setDate] = useState(today)
  // Falls back if the role changes mid-session; RLS is what actually hides team data.
  const active = canSee(view, profile.role) ? view : 'today'

  const page = ((): React.JSX.Element => {
    switch (active) {
      case 'today':
        return <UserSubmission profile={profile} date={date} onDateChange={setDate} />
      case 'history':
        return (
          <StatusHistory
            profile={profile}
            onEdit={(d) => {
              setDate(d)
              setView('today')
            }}
          />
        )
      case 'tasks':
        return <MyTasks profile={profile} />
      case 'team':
        return <AdminDashboard />
      case 'taskBoard':
        return <TaskBoard />
      case 'appearance':
        return <AppearanceSettings />
      default:
        return active satisfies never
    }
  })()

  return (
    <div className="flex h-screen bg-canvas text-fg">
      <Sidebar view={active} profile={profile} onNavigate={setView} />
      <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div key={active} className="mx-auto max-w-5xl animate-fade p-8">
          {page}
        </div>
      </main>
    </div>
  )
}

const Main = (): React.JSX.Element => {
  const { t } = useT()
  const auth = useAuth()
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
            <Button variant="ghost" onClick={() => db().auth.signOut()}>
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
