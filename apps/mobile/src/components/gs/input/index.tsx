'use client'
import React from 'react'
import { createInput } from '@gluestack-ui/core/input/creator'
import { View, Pressable, TextInput } from 'react-native'
import { tva } from '@gluestack-ui/utils/nativewind-utils'
import { withStyleContext } from '@gluestack-ui/utils/nativewind-utils'
import { withUniwind } from 'uniwind'
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils'
import { UIIcon as _UIIcon } from '@gluestack-ui/core/icon/creator'

const UIIcon = withUniwind(_UIIcon)

const SCOPE = 'INPUT'

const UIInput = createInput({
  Root: withStyleContext(View, SCOPE),
  Icon: UIIcon,
  Slot: Pressable,
  Input: TextInput
})

// Restyled with our tokens to match components/ui.tsx (48pt, grows with large text). No dark: classes.
const inputStyle = tva({
  base: 'min-h-12 w-full flex-row items-center gap-2 overflow-hidden rounded-[10px] border border-line bg-field px-3 data-[invalid=true]:border-bad data-[disabled=true]:opacity-50'
})

const inputIconStyle = tva({
  base: 'h-4 w-4 items-center justify-center fill-none text-fg-3'
})

const inputSlotStyle = tva({
  base: 'justify-center items-center web:disabled:cursor-not-allowed'
})

const inputFieldStyle = tva({
  base: 'flex-1 py-2 text-[16px] text-fg'
})

type IInputProps = React.ComponentProps<typeof UIInput> &
  VariantProps<typeof inputStyle> & { className?: string }
const Input = React.forwardRef<React.ComponentRef<typeof UIInput>, IInputProps>(function Input(
  { className, ...props },
  ref
) {
  return <UIInput ref={ref} {...props} className={inputStyle({ class: className })} context={{}} />
})

type IInputIconProps = React.ComponentProps<typeof UIInput.Icon> &
  VariantProps<typeof inputIconStyle> & {
    className?: string
    height?: number
    width?: number
  }

const InputIcon = React.forwardRef<React.ComponentRef<typeof UIInput.Icon>, IInputIconProps>(
  function InputIcon({ className, ...props }, ref) {
    return <UIInput.Icon ref={ref} {...props} className={inputIconStyle({ class: className })} />
  }
)

type IInputSlotProps = React.ComponentProps<typeof UIInput.Slot> &
  VariantProps<typeof inputSlotStyle> & { className?: string }

const InputSlot = React.forwardRef<React.ComponentRef<typeof UIInput.Slot>, IInputSlotProps>(
  function InputSlot({ className, ...props }, ref) {
    return (
      <UIInput.Slot
        ref={ref}
        {...props}
        className={inputSlotStyle({
          class: className
        })}
      />
    )
  }
)

type IInputFieldProps = React.ComponentPropsWithoutRef<typeof TextInput> &
  VariantProps<typeof inputFieldStyle> & { className?: string }

const InputField = React.forwardRef<React.ComponentRef<typeof TextInput>, IInputFieldProps>(
  function InputField({ className, ...props }, ref) {
    // A plain (Uniwind) TextInput, not createInput's field: that one forces aria-label "Input Field" and marks the
    // focused field aria-selected, both after our props, so TalkBack read "Input Field, selected" for every field.
    return (
      <TextInput
        ref={ref}
        {...props}
        className={inputFieldStyle({
          class: className
        })}
      />
    )
  }
)

Input.displayName = 'Input'
InputIcon.displayName = 'InputIcon'
InputSlot.displayName = 'InputSlot'
InputField.displayName = 'InputField'

export { Input, InputField, InputIcon, InputSlot }
