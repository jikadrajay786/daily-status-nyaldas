import { useT } from '@daily-status/core/i18n'
import { Check } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { withUniwind } from 'uniwind'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Pressable } from '@/components/gs/pressable'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { Badge } from '@/components/ui'
import {
  ACCENT_COLORS,
  ACCENT_TEXT,
  ACCENTS,
  PALETTES,
  THEME_TEXT,
  THEMES,
  useTheme,
  withAccent,
  type Theme
} from '@/lib/theme'

const CheckIcon = withUniwind(Check)

export const Section = ({
  title,
  children
}: {
  title: string
  children: ReactNode
}): React.JSX.Element => (
  <VStack className="gap-2">
    <Text
      accessibilityRole="header"
      className="text-[13px] font-semibold uppercase tracking-[0.8px] text-fg-2"
    >
      {title}
    </Text>
    {children}
  </VStack>
)

export const AppearanceSettings = (): React.JSX.Element => {
  const { t } = useT()
  return (
    <>
      <Section title={t('theme')}>
        <Themes />
      </Section>
      <Section title={t('accentColour')}>
        <Accents />
      </Section>
    </>
  )
}

const Themes = (): React.JSX.Element => {
  const { t } = useT()
  const { theme: current, setTheme } = useTheme()
  return (
    <VStack
      accessibilityRole="radiogroup"
      accessibilityLabel={t('theme')}
      className="overflow-hidden rounded-[14px] border border-line bg-card"
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
            className={`min-h-16 flex-row items-center gap-3.5 p-3.5 data-[active=true]:bg-selected ${i > 0 ? 'border-t-[length:hairlineWidth()] border-line' : ''} ${checked ? 'bg-selected' : ''}`}
          >
            <Swatch theme={theme} />
            <VStack className="flex-1 gap-0.5">
              <Text className="text-[16px] font-medium text-fg">{t(name)}</Text>
              <Text className="text-[13px] text-fg-3">{t(hint)}</Text>
            </VStack>
            {checked && <CheckIcon size={22} colorClassName="accent-accent-fg" />}
          </Pressable>
        )
      })}
    </VStack>
  )
}

const Accents = (): React.JSX.Element => {
  const { t } = useT()
  const { accent: current, setAccent, colors } = useTheme()
  return (
    <VStack className="gap-4">
      <Text className="text-[14px] text-fg-2">{t('accentHint')}</Text>
      <HStack
        accessibilityRole="radiogroup"
        accessibilityLabel={t('accentColour')}
        className="flex-wrap gap-2"
      >
        {ACCENTS.map((accent) => {
          const checked = accent === current
          const c = ACCENT_COLORS[accent][colors.scheme]
          return (
            <Pressable
              key={accent}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityLabel={t(ACCENT_TEXT[accent])}
              onPress={() => setAccent(accent)}
              className={`min-h-12 flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 data-[active=true]:bg-selected ${checked ? 'border-accent-fg bg-selected' : 'border-line bg-card'}`}
            >
              {/* Another accent's colour, not the active one's, so it is data rather than a class. */}
              <Box
                className="h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: c.accent }}
              >
                {checked && <Check size={18} color={c.onAccent} />}
              </Box>
              <Text
                className={`text-[15px] ${checked ? 'font-semibold android:font-bold text-fg' : 'text-fg-2'}`}
              >
                {t(ACCENT_TEXT[accent])}
              </Text>
            </Pressable>
          )
        })}
      </HStack>
      <Preview />
    </VStack>
  )
}

// Drawn with the live tokens, so it changes the moment a theme or colour is picked.
const Preview = (): React.JSX.Element => {
  const { t } = useT()
  return (
    <VStack
      accessible
      accessibilityLabel={t('preview')}
      className="gap-3 rounded-[14px] border border-line bg-canvas p-4"
    >
      <VStack className="gap-1.5 rounded-[12px] border border-line bg-card p-4">
        <HStack className="flex-wrap items-center justify-between gap-2">
          <Text className="text-[16px] font-semibold android:font-bold text-fg">
            {t('previewTitle')}
          </Text>
          <Badge label={t('stateDone')} tone="ok" />
        </HStack>
        <Text className="text-[14px] text-fg-2">{t('previewBody')}</Text>
      </VStack>
      <HStack className="items-center justify-between gap-3">
        <Box className="rounded-[10px] bg-accent px-4 py-2.5">
          <Text className="text-[15px] font-semibold android:font-bold text-on-accent">
            {t('submit')}
          </Text>
        </Box>
        <Text className="text-[14px] text-fg-2">
          {t('streak')}{' '}
          <Text className="text-[20px] font-bold tabular-nums text-accent-fg">12</Text>
        </Text>
      </HStack>
    </VStack>
  )
}

// A tiny preview: the theme's background with its accent, split light/dark for "Match my phone".
// Its colours are another theme's, not the active one's, so they stay data from PALETTES.
const Swatch = ({ theme }: { theme: Theme }): React.JSX.Element => {
  const { accent } = useTheme()
  const sides = (theme === 'system' ? [PALETTES.light, PALETTES.dark] : [PALETTES[theme]]).map(
    (p) => withAccent(p, accent)
  )
  return (
    <HStack className="h-11 w-11 overflow-hidden rounded-[10px] border border-line">
      {sides.map((p) => (
        <Box
          key={p.canvas}
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: p.canvas }}
        >
          <Box className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: p.accent }} />
        </Box>
      ))}
    </HStack>
  )
}
