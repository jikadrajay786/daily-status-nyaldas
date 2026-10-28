import { LangPicker } from '@daily-status/editor/LangPicker'
import { LoaderCircle } from 'lucide-react'
import {
  useId,
  type ButtonHTMLAttributes,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react'
import type { Tone } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'

const TONES: Record<Tone, string> = {
  ok: 'bg-ok/10 text-ok-fg ring-ok/20',
  info: 'bg-info/10 text-info-fg ring-info/20',
  warn: 'bg-warn/10 text-warn-fg ring-warn/20',
  bad: 'bg-bad/10 text-bad-fg ring-bad/20',
  idle: 'bg-fg-3/10 text-fg-2 ring-fg-3/25'
}

const TEXT: Record<Tone, string> = {
  ok: 'text-ok-fg',
  info: 'text-info-fg',
  warn: 'text-warn-fg',
  bad: 'text-bad-fg',
  idle: 'text-fg'
}

const BUTTONS = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  ghost: 'text-fg-2 ring-1 ring-line hover:bg-hover',
  danger: 'text-bad-fg ring-1 ring-bad/30 hover:bg-bad/10'
}

const CONTROL =
  'w-full rounded-lg border border-line bg-field px-3 py-2 text-sm text-fg placeholder:text-placeholder transition-[border-color,box-shadow] duration-150 ease-enter focus:border-accent-fg focus:ring-2 focus:ring-accent-fg/30 focus:outline-hidden'

export const Badge = ({ label, tone }: { label: string; tone: Tone }): React.JSX.Element => (
  <span
    className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 transition-colors duration-200 ease-enter ${TONES[tone]}`}
  >
    <span aria-hidden className="size-1.5 rounded-full bg-current" />
    {label}
  </span>
)

export const Notice = ({
  tone = 'idle',
  children
}: {
  tone?: Tone
  children: ReactNode
}): React.JSX.Element => (
  // Errors interrupt a screen reader, confirmations wait their turn; loading and empty states stay quiet.
  <p
    role={tone === 'bad' ? 'alert' : tone === 'ok' ? 'status' : undefined}
    className={`rounded-lg px-3 py-2 text-sm ring-1 ${TONES[tone]}`}
  >
    {children}
  </p>
)

export const Card = ({
  title,
  action,
  className = '',
  children
}: {
  title?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}): React.JSX.Element => (
  <section className={`rounded-xl border border-line bg-card p-5 shadow-soft ${className}`}>
    {title && (
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-fg-2 uppercase">{title}</h2>
        {action}
      </header>
    )}
    {children}
  </section>
)

// `busy` keeps the label (so the width never jumps) and adds a spinner in front of it.
export const Button = ({
  variant = 'primary',
  className = '',
  busy = false,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTONS
  busy?: boolean
}): React.JSX.Element => (
  <button
    type="button"
    {...props}
    disabled={disabled || busy}
    aria-busy={busy || undefined}
    className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color,transform] duration-150 ease-enter enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 aria-busy:cursor-wait aria-busy:opacity-80 ${BUTTONS[variant]} ${className}`}
  >
    {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
    {children}
  </button>
)

export const Field = ({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): React.JSX.Element => (
  <label className="flex flex-col gap-1.5 text-sm">
    <span className="font-medium text-fg-2">{label}</span>
    {children}
    {hint && <span className="text-xs text-fg-3">{hint}</span>}
  </label>
)

type Control = HTMLInputElement | HTMLTextAreaElement

const CHECKS: readonly [keyof ValidityState, Key][] = [
  ['valueMissing', 'vRequired'],
  ['typeMismatch', 'vEmail'],
  ['tooShort', 'vTooShort'],
  ['rangeUnderflow', 'vRange'],
  ['rangeOverflow', 'vRange'],
  ['stepMismatch', 'vStep'],
  ['patternMismatch', 'vCode']
]

// Chromium words its validation bubbles in the OS language, so swap in the app's own translation.
const useValidity = (): Pick<InputHTMLAttributes<Control>, 'onInvalid' | 'onInput'> => {
  const { t } = useT()
  return {
    onInvalid: (e: FormEvent<Control>) => {
      const el = e.currentTarget
      const key = CHECKS.find(([c]) => el.validity[c])?.[1]
      const attr = (a: string): string => el.getAttribute(a) ?? ''
      el.setCustomValidity(
        key
          ? t(key === 'vRange' && el.type === 'date' ? 'vFuture' : key, {
              n: attr('minlength'),
              min: attr('min'),
              max: attr('max')
            })
          : ''
      )
    },
    onInput: (e: FormEvent<Control>) => e.currentTarget.setCustomValidity('')
  }
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element => (
  <input {...useValidity()} {...props} className={CONTROL} />
)

export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element => (
  <select {...props} className={CONTROL} />
)

export const TextArea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element => (
  <textarea {...useValidity()} {...props} className={`${CONTROL} min-h-24 resize-y`} />
)

export { LangPicker }

export const LangSwitch = (): React.JSX.Element => {
  const { lang, setLang, t } = useT()
  return <LangPicker value={lang} onChange={setLang} label={t('language')} />
}

export const Stat = ({
  label,
  value,
  sub,
  tone = 'idle',
  loading = false
}: {
  label: string
  value: ReactNode
  sub?: string
  tone?: Tone
  loading?: boolean
}): React.JSX.Element => (
  <div className="rounded-xl border border-line bg-card p-4 shadow-soft">
    <p className="text-xs font-medium text-fg-2">{label}</p>
    <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${TEXT[tone]}`}>
      {loading ? <Skeleton className="h-[1lh] w-16" /> : value}
    </p>
    {sub ? (
      <p className="mt-1 text-xs text-fg-3">{sub}</p>
    ) : (
      loading && <Skeleton className="mt-1.5 h-3 w-24" />
    )}
  </div>
)

export const PageHeader = ({
  title,
  subtitle,
  action
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}): React.JSX.Element => (
  <header className="mb-6 flex items-end justify-between gap-4">
    <div>
      <h1 className="text-xl font-semibold text-fg">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-fg-2">{subtitle}</p>}
    </div>
    {action}
  </header>
)

type TabsProps<K extends string> = {
  label: string
  tabs: readonly (readonly [K, string])[]
  value: K
  onChange: (k: K) => void
  children: ReactNode
}

// ARIA tabs: only the selected tab is in the Tab order, and arrow keys move between tabs.
export const Tabs = <K extends string>({
  label,
  tabs,
  value,
  onChange,
  children
}: TabsProps<K>): React.JSX.Element => {
  const id = useId()
  const move = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!step) return
    const i = (tabs.findIndex(([k]) => k === value) + step + tabs.length) % tabs.length
    const next = tabs[i]
    if (!next) return
    onChange(next[0])
    e.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')[i]?.focus()
  }
  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={move}
        className="mb-6 flex gap-1 border-b border-line"
      >
        {tabs.map(([k, text]) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`${id}-${k}`}
            aria-selected={value === k}
            aria-controls={`${id}-panel`}
            tabIndex={value === k ? 0 : -1}
            onClick={() => onChange(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              value === k
                ? 'border-accent-fg text-fg'
                : 'border-transparent text-fg-2 hover:text-fg'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`}>
        {children}
      </div>
    </>
  )
}

export const Avatar = ({
  text,
  size = 'md'
}: {
  text: string
  size?: 'md' | 'lg'
}): React.JSX.Element => (
  <span
    aria-hidden
    className={`grid shrink-0 place-items-center rounded-full bg-accent/15 font-semibold text-accent-fg ${
      size === 'lg' ? 'size-14 text-lg' : 'size-9 text-xs'
    }`}
  >
    {text}
  </span>
)

export const Skeleton = ({ className = '' }: { className?: string }): React.JSX.Element => (
  <span aria-hidden className={`skeleton block rounded-md ${className}`} />
)

// Wraps skeletons so screen readers hear "Loading" once instead of silence.
export const Loading = ({
  className = '',
  children
}: {
  className?: string
  children: ReactNode
}): React.JSX.Element => {
  const { t } = useT()
  return (
    <div role="status" aria-busy className={className}>
      <span className="sr-only">{t('loading')}</span>
      {children}
    </div>
  )
}

// An empty list: a soft icon, what's missing, and what to do about it.
export const Empty = ({
  icon,
  title,
  hint,
  action
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}): React.JSX.Element => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-12 text-center">
    <span
      aria-hidden
      className="mb-2 grid size-14 place-items-center rounded-full bg-accent/10 text-accent-fg"
    >
      {icon}
    </span>
    <p className="font-semibold text-fg">{title}</p>
    {hint && <p className="max-w-sm text-sm text-fg-2">{hint}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
)
