'use client'
import { createAvatar } from '@gluestack-ui/core/avatar/creator'
import React from 'react'

import { Image, Text, View } from 'react-native'

import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils'
import { tva, withStyleContext } from '@gluestack-ui/utils/nativewind-utils'
const SCOPE = 'AVATAR'

const UIAvatar = createAvatar({
  Root: withStyleContext(View, SCOPE),
  Badge: View,
  Group: View,
  Image: Image,
  FallbackText: Text
})

const avatarStyle = tva({
  base: 'relative shrink-0 items-center justify-center rounded-full bg-accent/15',
  variants: { size: { md: 'h-10 w-10', lg: 'h-14 w-14' } },
  defaultVariants: { size: 'md' }
})

const avatarGroupStyle = tva({
  base: 'group/avatar-group flex-row-reverse relative avatar-group'
})

const avatarBadgeStyle = tva({
  base: 'absolute h-3 w-3 rounded-full border-2 border-background right-0 bottom-0 bg-ok-fg'
})

const avatarImageStyle = tva({
  base: 'h-full w-full rounded-full absolute'
})

type IAvatarProps = Omit<React.ComponentPropsWithoutRef<typeof UIAvatar>, 'context'> &
  VariantProps<typeof avatarStyle>

const Avatar = React.forwardRef<React.ComponentRef<typeof UIAvatar>, IAvatarProps>(function Avatar(
  { className, size, ...props },
  ref
) {
  return (
    <UIAvatar
      ref={ref}
      {...props}
      className={avatarStyle({ size, class: className })}
      context={{ size }}
    />
  )
})

type IAvatarBadgeProps = React.ComponentPropsWithoutRef<typeof UIAvatar.Badge> &
  VariantProps<typeof avatarBadgeStyle>

const AvatarBadge = React.forwardRef<React.ComponentRef<typeof UIAvatar.Badge>, IAvatarBadgeProps>(
  function AvatarBadge({ className, ...props }, ref) {
    return (
      <UIAvatar.Badge ref={ref} {...props} className={avatarBadgeStyle({ class: className })} />
    )
  }
)

type IAvatarImageProps = React.ComponentPropsWithoutRef<typeof UIAvatar.Image> &
  VariantProps<typeof avatarImageStyle>

const AvatarImage = React.forwardRef<React.ComponentRef<typeof UIAvatar.Image>, IAvatarImageProps>(
  function AvatarImage({ className, ...props }, ref) {
    return (
      <UIAvatar.Image
        ref={ref}
        {...props}
        className={avatarImageStyle({
          class: className
        })}
        resizeMode="cover"
      />
    )
  }
)

type IAvatarGroupProps = React.ComponentPropsWithoutRef<typeof UIAvatar.Group> &
  VariantProps<typeof avatarGroupStyle>

const AvatarGroup = React.forwardRef<React.ComponentRef<typeof UIAvatar.Group>, IAvatarGroupProps>(
  function AvatarGroup({ className, ...props }, ref) {
    return (
      <UIAvatar.Group
        ref={ref}
        {...props}
        className={avatarGroupStyle({
          class: className
        })}
      />
    )
  }
)

// No AvatarFallbackText: its charAt(0) splits conjuncts. ui.tsx's Avatar renders plain initials instead.
export { Avatar, AvatarBadge, AvatarGroup, AvatarImage }
