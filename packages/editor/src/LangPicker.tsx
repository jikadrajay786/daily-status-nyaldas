import { LANG_LIST, LANGS, type Lang } from '@daily-status/core/i18n'

type Props = { value: Lang; onChange: (l: Lang) => void; label: string }

export const LangPicker = ({ value, onChange, label }: Props): React.JSX.Element => (
  <div role="group" aria-label={label} className="flex gap-0.5 rounded-lg p-0.5 ring-1 ring-line">
    {LANG_LIST.map((l) => (
      <button
        key={l}
        type="button"
        lang={l}
        aria-pressed={value === l}
        onClick={() => onChange(l)}
        className={`flex-1 rounded-md px-2 py-1 text-xs font-medium ${value === l ? 'bg-selected text-fg' : 'text-fg-2 hover:text-fg'}`}
      >
        {LANGS[l]}
      </button>
    ))}
  </div>
)
