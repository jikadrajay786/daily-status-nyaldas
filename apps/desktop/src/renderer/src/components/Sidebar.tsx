import type { Profile } from '@daily-status/core/database.types'
import { nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import { canSee, NAV, type View } from '../lib/nav'
import { Badge, LangSwitch } from './ui'

type Props = { view: View; profile: Profile; onNavigate: (v: View) => void }

export const Sidebar = ({ view, profile, onNavigate }: Props): React.JSX.Element => {
  const { t } = useT()
  const admin = profile.role === 'admin'
  // Width capped so the largest text sizes still leave room for the page.
  return (
    <aside className="flex w-60 max-w-[30vw] shrink-0 flex-col overflow-y-auto border-r border-line bg-panel p-4">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <div className="grid size-8 place-items-center rounded-lg bg-accent text-xs font-bold text-on-accent">
          DS
        </div>
        <span className="font-semibold">Daily Status</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.filter((n) => canSee(n.id, profile.role)).map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onNavigate(n.id)}
            aria-current={view === n.id ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              view === n.id ? 'bg-selected text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg'
            }`}
          >
            {t(n.label)}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-4 border-t border-line pt-4">
        <LangSwitch />
        <div className="px-2">
          <p className="truncate text-sm font-medium">{nameOf(profile)}</p>
          <p className="mb-2 truncate text-xs text-fg-3">{profile.email}</p>
          <Badge label={t(admin ? 'roleAdmin' : 'roleMember')} tone={admin ? 'warn' : 'idle'} />
        </div>
        <button
          type="button"
          onClick={() => db().auth.signOut()}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg-2 hover:bg-hover hover:text-fg"
        >
          {t('signOut')}
        </button>
      </div>
    </aside>
  )
}
