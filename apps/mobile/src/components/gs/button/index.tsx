'use client'
import React from 'react'
import { createButton } from '@gluestack-ui/core/button/creator'
import {
  tva,
  withStyleContext,
  useStyleContext,
  type VariantProps
} from '@gluestack-ui/utils/nativewind-utils'
import { withUniwind } from 'uniwind'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { UIIcon as _UIIcon } from '@gluestack-ui/core/icon/creator'

const UIIcon = withUniwind(_UIIcon)
const SCOPE = 'BUTTON'
const Root = withStyleContext(Pressable, SCOPE)
const UIButton = createButton({
  Root: Root,
  Text,
  Group: View,
  Spinner: ActivityIndicator,
  Icon: UIIcon
})
// Variants restyled with our tokens to match components/ui.tsx. No dark: classes: Uniwind's dark: only matches the
// plain dark theme, while our variables already change per theme.
const buttonStyle = tva({
  base: 'min-h-12 rounded-[10px] border flex-row items-center justify-center gap-2 px-4 data-[disabled=true]:opacity-40',
  variants: {
    variant: {
      default: 'border-accent bg-accent data-[active=true]:bg-accent-hover',
      destructive: 'border-bad/30 bg-transparent data-[active=true]:bg-bad/15',
      outline: 'border-line bg-card data-[active=true]:bg-selected',
      secondary: 'border-panel bg-panel data-[active=true]:bg-selected',
      ghost: 'border-line bg-transparent data-[active=true]:bg-selected',
      link: 'border-transparent bg-transparent data-[active=true]:underline'
    },
    size: {
      default: '',
      sm: 'min-h-10 px-3',
      lg: 'min-h-14 px-6',
      icon: 'min-w-12 px-0'
    }
  }
})
const textTone = {
  default: 'text-on-accent',
  destructive: 'text-bad-fg',
  outline: 'text-fg',
  secondary: 'text-fg',
  ghost: 'text-fg-2',
  link: 'text-accent-fg'
}
const buttonTextStyle = tva({
  // Android measures weight-600 Roboto narrower than it draws it, clipping short labels by a letter ("Cance"
  // beside another button), with or without classes; 700 measures true. iOS keeps semibold.
  base: 'font-semibold android:font-bold',
  parentVariants: {
    variant: textTone,
    size: {
      default: 'text-base',
      sm: 'text-sm',
      lg: 'text-lg',
      icon: 'text-base'
    }
  }
})

const buttonSpinnerStyle = tva({
  base: '',
  parentVariants: {
    size: {
      default: 'h-4 w-4',
      sm: 'h-4 w-4',
      lg: 'h-4 w-4',
      icon: 'h-4 w-4'
    }
  }
})

const buttonIconStyle = tva({
  base: 'fill-none pointer-events-none shrink-0',
  parentVariants: {
    variant: textTone,
    size: {
      default: 'h-4 w-4',
      sm: 'h-4 w-4',
      lg: 'h-5 w-5',
      icon: 'h-5 w-5'
    }
  }
})
const buttonGroupStyle = tva({
  base: '',
  variants: {
    space: {
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-3',
      lg: 'gap-4',
      xl: 'gap-5',
      '2xl': 'gap-6',
      '3xl': 'gap-7',
      '4xl': 'gap-8'
    },
    isAttached: {
      true: 'gap-0'
    },
    flexDirection: {
      row: 'flex-row',
      column: 'flex-col',
      'row-reverse': 'flex-row-reverse',
      'column-reverse': 'flex-col-reverse'
    }
  }
})
type IButtonProps = Omit<React.ComponentPropsWithoutRef<typeof UIButton>, 'context'> &
  VariantProps<typeof buttonStyle> & { className?: string }
const Button = React.forwardRef<React.ElementRef<typeof UIButton>, IButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <UIButton
        ref={ref}
        {...props}
        className={buttonStyle({ variant, size, class: className })}
        context={{ variant, size }}
      />
    )
  }
)
type IButtonTextProps = React.ComponentPropsWithoutRef<typeof UIButton.Text> &
  VariantProps<typeof buttonTextStyle> & { className?: string }
const ButtonText = React.forwardRef<React.ElementRef<typeof UIButton.Text>, IButtonTextProps>(
  ({ className, size, ...props }, ref) => {
    const { size: parentSize, variant: parentVariant } = useStyleContext(SCOPE)
    return (
      <UIButton.Text
        ref={ref}
        {...props}
        className={buttonTextStyle({
          parentVariants: {
            size: parentSize,
            variant: parentVariant
          },
          size,
          class: className
        })}
      />
    )
  }
)
const ButtonSpinner = React.forwardRef<
  React.ElementRef<typeof UIButton.Spinner>,
  React.ComponentPropsWithoutRef<typeof UIButton.Spinner>
>(({ className, size, ...props }, ref) => {
  const { size: parentSize } = useStyleContext(SCOPE)
  // Upstream passed ActivityIndicator's size into the variant call; it belongs on the spinner.
  return (
    <UIButton.Spinner
      ref={ref}
      size={size}
      {...props}
      className={buttonSpinnerStyle({ parentVariants: { size: parentSize }, class: className })}
    />
  )
})
type IButtonIcon = React.ComponentPropsWithoutRef<typeof UIButton.Icon> &
  VariantProps<typeof buttonIconStyle> & {
    className?: string | undefined
    as?: React.ElementType
    height?: number
    width?: number
  }
const ButtonIcon = React.forwardRef<React.ElementRef<typeof UIButton.Icon>, IButtonIcon>(
  ({ className, size, ...props }, ref) => {
    const { size: parentSize, variant: parentVariant } = useStyleContext(SCOPE)
    if (typeof size === 'number') {
      return (
        <UIButton.Icon
          ref={ref}
          {...props}
          className={buttonIconStyle({ class: className })}
          size={size}
        />
      )
    } else if ((props.height !== undefined || props.width !== undefined) && size === undefined) {
      return (
        <UIButton.Icon ref={ref} {...props} className={buttonIconStyle({ class: className })} />
      )
    }
    return (
      <UIButton.Icon
        {...props}
        className={buttonIconStyle({
          parentVariants: {
            size: parentSize,
            variant: parentVariant
          },
          size,
          class: className
        })}
        ref={ref}
      />
    )
  }
)
type IButtonGroupProps = React.ComponentPropsWithoutRef<typeof UIButton.Group> &
  VariantProps<typeof buttonGroupStyle>
const ButtonGroup = React.forwardRef<React.ElementRef<typeof UIButton.Group>, IButtonGroupProps>(
  ({ className, space = 'md', isAttached = false, flexDirection = 'column', ...props }, ref) => {
    return (
      <UIButton.Group
        className={buttonGroupStyle({
          class: className,
          space,
          isAttached,
          flexDirection
        })}
        {...props}
        ref={ref}
      />
    )
  }
)
Button.displayName = 'Button'
ButtonText.displayName = 'ButtonText'
ButtonSpinner.displayName = 'ButtonSpinner'
ButtonIcon.displayName = 'ButtonIcon'
ButtonGroup.displayName = 'ButtonGroup'
export { Button, ButtonText, ButtonSpinner, ButtonIcon, ButtonGroup }
