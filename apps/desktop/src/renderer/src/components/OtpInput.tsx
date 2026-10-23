import { useEffect, useRef, useState } from 'react'
import { CODE_LENGTH } from '@daily-status/core/useVerifyCode'

type Props = {
  value: string
  onChange: (raw: string) => void
  label: string
  describedBy: string
  invalid: boolean
  disabled: boolean
  // Changes on every rejected code: shakes the boxes and puts the cursor back.
  rejected: number
}

const BOXES = Array.from({ length: CODE_LENGTH }, (_, i) => i)

const boxTone = (invalid: boolean, here: boolean, filled: boolean): string => {
  if (invalid) return 'border-bad ring-2 ring-bad/25'
  if (here) return 'border-accent-fg ring-4 ring-accent-fg/20'
  return filled ? 'border-fg-3' : 'border-line'
}

// One real input drawn as six boxes. Separate inputs per digit break paste, OS code autofill, undo and screen
// readers; a single field gets all of them for free and the boxes only mirror its value.
export const OtpInput = ({
  value,
  onChange,
  label,
  describedBy,
  invalid,
  disabled,
  rejected
}: Props): React.JSX.Element => {
  const input = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const active = Math.min(value.length, CODE_LENGTH - 1)

  useEffect(() => {
    if (!disabled) input.current?.focus()
  }, [rejected, disabled])

  return (
    <div className="relative mx-auto w-fit">
      <input
        ref={input}
        autoFocus
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        spellCheck={false}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // The caret always sits after the last digit, so typing fills the next box and Backspace clears the last.
        onSelect={(e) => {
          const end = e.currentTarget.value.length
          if (e.currentTarget.selectionStart !== end) e.currentTarget.setSelectionRange(end, end)
        }}
        className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 disabled:cursor-wait"
      />
      <div
        key={rejected}
        aria-hidden
        className={`flex items-center gap-2 ${rejected ? 'animate-shake' : ''}`}
      >
        {BOXES.map((i) => {
          const here = focused && !disabled && i === active
          return (
            <div
              key={i}
              aria-current={here || undefined}
              className={`grid h-14 w-12 place-items-center rounded-xl border-2 bg-field text-2xl font-semibold text-fg tabular-nums transition-[border-color,box-shadow,opacity] duration-150 ease-enter ${
                i === CODE_LENGTH / 2 ? 'ml-3' : ''
              } ${boxTone(invalid, here, !!value[i])} ${disabled ? 'opacity-60' : ''}`}
            >
              {value[i] ?? (here && <span className="h-7 w-0.5 animate-caret rounded bg-fg" />)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
