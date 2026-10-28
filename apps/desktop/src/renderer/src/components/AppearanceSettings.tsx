import { Check, Monitor, RotateCcw } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { THEMES, type Theme } from '../../../shared/appearance'
import {
  CONTRASTS,
  DEFAULTS,
  DENSITIES,
  FONTS,
  SIZES,
  setAppearance,
  useAppearance,
  type Appearance
} from '../lib/appearance'
import { useT, type Key } from '@daily-status/core/i18n'
import { ACCENTS, type Accent } from '@daily-status/core/palettes'
import { Badge, Button, Card, PageHeader } from './ui'

const THEME_TEXT: Record<Theme, [Key, Key]> = {
  system: ['themeSystem', 'themeSystemHint'],
  light: ['themeLight', 'themeLightHint'],
  dark: ['themeDark', 'themeDarkHint'],
  midnight: ['themeMidnight', 'themeMidnightHint']
}
const ACCENT_TEXT: Record<Accent, Key> = {
  indigo: 'accentIndigo',
  emerald: 'accentEmerald',
  blue: 'accentBlue',
  purple: 'accentPurple',
  amber: 'accentAmber',
  cyan: 'accentCyan'
}
const FONT_TEXT: Record<Appearance['font'], Key> = {
  sans: 'fontSans',
  serif: 'fontSerif',
  mono: 'fontMono',
  dyslexic: 'fontDyslexic'
}
const SIZE_TEXT: Record<Appearance['size'], [Key, number]> = {
  sm: ['sizeSm', 14],
  md: ['sizeMd', 16],
  lg: ['sizeLg', 18],
  xl: ['sizeXl', 20],
  '2xl': ['size2xl', 24],
  '3xl': ['size3xl', 32]
}
const DENSITY_TEXT: Record<Appearance['density'], [Key, Key]> = {
  comfortable: ['densityComfortable', 'densityComfortableHint'],
  compact: ['densityCompact', 'densityCompactHint']
}
const CONTRAST_TEXT: Record<Appearance['contrast'], [Key, Key]> = {
  system: ['contrastSystem', 'contrastSystemHint'],
  normal: ['contrastNormal', 'contrastNormalHint'],
  more: ['contrastMore', 'contrastMoreHint']
}
const MOD = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl'
// Shown in every UI language, because people write updates in all three scripts.
const SAMPLE = 'Finished the report · आज का काम · આજનું કામ'

// aria-label replaces the visible text as the name, so the hint is wired up as the description instead.
const Choice = ({
  selected,
  onPick,
  label,
  hint,
  children
}: {
  selected: boolean
  onPick: () => void
  label: string
  hint?: string
  children: ReactNode
}): React.JSX.Element => {
  const id = useId()
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      aria-describedby={hint && id}
      onClick={onPick}
      className={`relative flex flex-col gap-2 rounded-xl border p-2 text-left transition-colors ${
        selected ? 'border-accent-fg ring-2 ring-accent-fg/40' : 'border-line hover:bg-hover'
      }`}
    >
      {selected && (
        <Check
          className="absolute top-2 right-2 size-4 rounded-full bg-accent p-0.5 text-on-accent"
          aria-hidden
        />
      )}
      {children}
      {hint && (
        <span id={id} className="px-1 pb-1 text-xs text-fg-3">
          {hint}
        </span>
      )}
    </button>
  )
}

// A miniature of the app drawn with the real tokens, scoped by data-theme so it previews that theme.
const Mini = ({ theme }: { theme: Exclude<Theme, 'system'> }): React.JSX.Element => (
  <div
    data-theme={theme}
    className="flex h-20 flex-1 overflow-hidden rounded-lg border border-line forced-color-adjust-none"
  >
    <div className="flex w-1/4 flex-col gap-1 bg-panel p-1.5">
      <span className="h-1.5 rounded-full bg-accent" />
      <span className="h-1.5 rounded-full bg-fg-3/40" />
      <span className="h-1.5 rounded-full bg-fg-3/40" />
    </div>
    <div className="flex flex-1 flex-col gap-1.5 bg-canvas p-1.5">
      <div className="flex flex-col gap-1 rounded-md border border-line bg-card p-1.5">
        <span className="h-1.5 w-3/4 rounded-full bg-fg" />
        <span className="h-1.5 w-1/2 rounded-full bg-fg-3/60" />
      </div>
      <div className="flex gap-1">
        <span className="h-2 w-6 rounded-full bg-accent" />
        <span className="h-2 w-3 rounded-full bg-ok" />
        <span className="h-2 w-3 rounded-full bg-bad" />
      </div>
    </div>
  </div>
)

// The real tokens, so it shows exactly what the chosen theme and colour look like.
const Preview = (): React.JSX.Element => {
  const { t } = useT()
  return (
    <div
      aria-label={t('preview')}
      role="img"
      className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-4"
    >
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-4 shadow-raised">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-fg">{t('previewTitle')}</span>
          <Badge label={t('stateDone')} tone="ok" />
        </div>
        <p className="text-sm text-fg-2">{t('previewBody')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="pointer-events-none">
          <Button tabIndex={-1}>{t('submit')}</Button>
        </span>
        <span className="text-sm text-fg-2">
          {t('streak')} <b className="text-lg font-semibold text-accent-fg tabular-nums">12</b>
        </span>
      </div>
    </div>
  )
}

export const AppearanceSettings = (): React.JSX.Element => {
  const { t } = useT()
  const a = useAppearance()

  return (
    <>
      <PageHeader
        title={t('navAppearance')}
        subtitle={t('appearanceSubtitle')}
        action={
          <Button
            variant="ghost"
            onClick={() => setAppearance(DEFAULTS)}
            className="inline-flex items-center gap-1.5"
          >
            <RotateCcw className="size-4" aria-hidden />
            {t('resetDefaults')}
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Card title={t('theme')}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
            {THEMES.map((theme) => {
              const [name, hint] = THEME_TEXT[theme]
              return (
                <Choice
                  key={theme}
                  selected={a.theme === theme}
                  onPick={() => setAppearance({ theme })}
                  label={t(name)}
                  hint={t(hint)}
                >
                  <div className="flex gap-1">
                    {theme === 'system' ? (
                      <>
                        <Mini theme="light" />
                        <Mini theme="dark" />
                      </>
                    ) : (
                      <Mini theme={theme} />
                    )}
                  </div>
                  <span className="px-1 text-sm font-medium text-fg">{t(name)}</span>
                </Choice>
              )
            })}
          </div>
        </Card>

        <Card title={t('accentColour')}>
          <div className="flex flex-wrap gap-6">
            <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-3">
              <p className="text-sm text-fg-2">{t('accentHint')}</p>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    aria-pressed={a.accent === accent}
                    onClick={() => setAppearance({ accent })}
                    className={`flex items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-1.5 text-sm font-medium transition-colors ${
                      a.accent === accent
                        ? 'border-accent-fg bg-selected text-fg'
                        : 'border-line text-fg-2 hover:bg-hover'
                    }`}
                  >
                    <span
                      data-accent={accent}
                      className="grid size-6 place-items-center rounded-full bg-accent text-on-accent forced-color-adjust-none"
                    >
                      {a.accent === accent && <Check aria-hidden className="size-3.5" />}
                    </span>
                    {t(ACCENT_TEXT[accent])}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0 flex-[1_1_18rem]">
              <Preview />
            </div>
          </div>
        </Card>

        <Card title={t('font')}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-3">
            {FONTS.map((font) => (
              <Choice
                key={font}
                selected={a.font === font}
                onPick={() => setAppearance({ font })}
                label={t(FONT_TEXT[font])}
              >
                <span data-font={font} className="px-2 pt-1 text-lg text-fg">
                  {SAMPLE}
                </span>
                <span className="px-2 pb-1 text-xs text-fg-3">
                  {t(FONT_TEXT[font])}
                  {font === 'dyslexic' && ' (OpenDyslexic)'}
                </span>
              </Choice>
            ))}
          </div>
        </Card>

        <Card title={t('textSize')}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
            {SIZES.map((size) => {
              const [name, px] = SIZE_TEXT[size]
              return (
                <Choice
                  key={size}
                  selected={a.size === size}
                  onPick={() => setAppearance({ size })}
                  label={t(name)}
                >
                  {/* Fixed px, not rem: the sample must show each size, not the currently active one. */}
                  <span
                    className="grid h-10 place-items-center font-semibold text-fg"
                    style={{ fontSize: px }}
                  >
                    Aa
                  </span>
                  <span className="text-center text-xs text-fg-2">{t(name)}</span>
                </Choice>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-fg-3">{t('sizeShortcut', { key: MOD })}</p>
        </Card>

        <Card title={t('density')}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-2">
            {DENSITIES.map((density) => {
              const [name, hint] = DENSITY_TEXT[density]
              const gap = density === 'compact' ? 'gap-0.5' : 'gap-1.5'
              return (
                <Choice
                  key={density}
                  selected={a.density === density}
                  onPick={() => setAppearance({ density })}
                  label={t(name)}
                  hint={t(hint)}
                >
                  <div className={`flex h-10 flex-col justify-center px-2 ${gap}`}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 rounded-full bg-fg-3/50" />
                    ))}
                  </div>
                  <span className="px-1 text-xs font-medium text-fg">{t(name)}</span>
                </Choice>
              )
            })}
          </div>
        </Card>

        <Card title={t('contrast')}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
            {CONTRASTS.map((contrast) => {
              const [name, hint] = CONTRAST_TEXT[contrast]
              return (
                <Choice
                  key={contrast}
                  selected={a.contrast === contrast}
                  onPick={() => setAppearance({ contrast })}
                  label={t(name)}
                  hint={t(hint)}
                >
                  {/* Fixed strengths: the sample must show each option, not the currently active one. */}
                  <span className="grid h-10 place-items-center text-xl" aria-hidden>
                    {contrast === 'system' ? (
                      <Monitor className="size-6 text-fg-2" />
                    ) : (
                      <span className={contrast === 'more' ? 'font-bold text-fg' : 'text-fg/55'}>
                        Aa
                      </span>
                    )}
                  </span>
                  <span className="px-1 text-sm font-medium text-fg">{t(name)}</span>
                </Choice>
              )
            })}
          </div>
        </Card>
      </div>
    </>
  )
}
