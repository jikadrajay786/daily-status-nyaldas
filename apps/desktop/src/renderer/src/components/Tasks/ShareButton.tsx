import { useT, type Key } from '@daily-status/core/i18n'
import type { BoardTask } from '@daily-status/core/taskService'
import { shareText } from '@daily-status/core/taskShare'
import { Copy, Hash, Mail, MessageSquareText, MoreHorizontal, Share2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import type { ShareVia } from '../../../../shared/ipc'
import { Button } from '../ui'

const MAC = window.electron.process.platform === 'darwin'

const CHOICES: { via: ShareVia; label: Key; icon: typeof Copy }[] = [
  { via: 'whatsapp', label: 'shareWhatsApp', icon: MessageSquareText },
  { via: 'slack', label: 'shareSlack', icon: Hash },
  { via: 'email', label: 'shareEmail', icon: Mail },
  { via: 'copy', label: 'shareCopy', icon: Copy },
  ...(MAC ? [{ via: 'system' as const, label: 'shareMore' as const, icon: MoreHorizontal }] : [])
]

const SAID: Partial<Record<ShareVia, Key>> = { copy: 'shareCopied', slack: 'shareSlackCopied' }

// Electron has no Web Share API, so this is our own menu; on a Mac "More…" opens the system share menu.
export const ShareButton = ({ task }: { task: BoardTask }): React.JSX.Element => {
  const { t, locale } = useT()
  const id = useId()
  const menu = useRef<HTMLDivElement>(null)
  const [said, setSaid] = useState<Key | null>(null)

  useEffect(() => {
    if (!said) return
    const timer = setTimeout(() => setSaid(null), 4000)
    return () => clearTimeout(timer)
  }, [said])

  // Popovers sit in the top layer, so cards can't clip them; place it beside the button, flipped near edges.
  const place = (e: MouseEvent<HTMLButtonElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    const m = menu.current?.style
    if (!m) return
    const up = r.bottom > innerHeight * 0.6
    const left = r.left < innerWidth / 2
    Object.assign(m, {
      top: up ? 'auto' : `${r.bottom + 4}px`,
      bottom: up ? `${innerHeight - r.top + 4}px` : 'auto',
      left: left ? `${r.left}px` : 'auto',
      right: left ? 'auto' : `${innerWidth - r.right}px`
    })
    requestAnimationFrame(() => menu.current?.querySelector('button')?.focus())
  }

  const send = async (via: ShareVia): Promise<void> => {
    menu.current?.hidePopover()
    const ok = await window.api.share(via, shareText(task, t, locale))
    setSaid(ok ? (SAID[via] ?? null) : 'errGeneric')
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="ghost" popoverTarget={id} onClick={place} aria-label={t('shareTask')}>
        <Share2 aria-hidden className="size-4" />
        {t('share')}
      </Button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        aria-label={t('shareTask')}
        className="fixed m-0 min-w-52 flex-col gap-0.5 rounded-xl border border-line bg-card p-1.5 text-fg shadow-raised open:flex"
      >
        {CHOICES.map(({ via, label, icon: Icon }) => (
          <button
            key={via}
            type="button"
            onClick={() => void send(via)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-hover"
          >
            <Icon aria-hidden className="size-4 text-fg-2" />
            {t(label)}
          </button>
        ))}
      </div>
      <span aria-live="polite" className="text-xs text-fg-2">
        {said && t(said)}
      </span>
    </span>
  )
}
