'use client'
import React from 'react'
import { Text, View } from 'react-native'
import { tva } from '@gluestack-ui/utils/nativewind-utils'
import { withStyleContext, useStyleContext } from '@gluestack-ui/utils/nativewind-utils'
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils'

const SCOPE = 'BADGE'

// Restyled as our tone badges (desktop's bg-*/15 tint, border-*/30); variant is a core Tone.
const badgeStyle = tva({
  base: 'self-start flex-row items-center justify-center rounded-full border px-2.5 py-[3px]',
  variants: {
    variant: {
      ok: 'border-ok/20 bg-ok/10',
      info: 'border-info/20 bg-info/10',
      warn: 'border-warn/20 bg-warn/10',
      bad: 'border-bad/20 bg-bad/10',
      idle: 'border-fg-3/25 bg-fg-3/10'
    }
  }
})

const tone = {
  ok: 'text-ok-fg',
  info: 'text-info-fg',
  warn: 'text-warn-fg',
  bad: 'text-bad-fg',
  idle: 'text-fg-2'
}
const badgeTextStyle = tva({
  base: 'text-[13px] font-medium',
  parentVariants: { variant: tone }
})

const ContextView = withStyleContext(View, SCOPE)

type IBadgeProps = React.ComponentPropsWithoutRef<typeof ContextView> &
  VariantProps<typeof badgeStyle>
function Badge({
  children,
  variant = 'idle',
  className,
  ...props
}: { className?: string } & IBadgeProps): React.JSX.Element {
  return (
    <ContextView
      className={badgeStyle({ variant, class: className })}
      {...props}
      context={{ variant }}
    >
      {children}
    </ContextView>
  )
}

type IBadgeTextProps = React.ComponentPropsWithoutRef<typeof Text> &
  VariantProps<typeof badgeTextStyle>

const BadgeText = React.forwardRef<React.ComponentRef<typeof Text>, IBadgeTextProps>(
  function BadgeText({ children, className, ...props }, ref) {
    const { variant: parentVariant } = useStyleContext(SCOPE)
    return (
      <Text
        ref={ref}
        className={badgeTextStyle({
          parentVariants: {
            variant: parentVariant
          },
          class: className
        })}
        {...props}
      >
        {children}
      </Text>
    )
  }
)

Badge.displayName = 'Badge'
BadgeText.displayName = 'BadgeText'

export { Badge, BadgeText }
