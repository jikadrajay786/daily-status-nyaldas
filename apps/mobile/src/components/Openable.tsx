import type { CommentTarget } from '@daily-status/core/commentService'
import { useT } from '@daily-status/core/i18n'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable } from './gs/pressable'
import { detailsHref, useQuickComment } from '@/lib/quickComment'

// A card that opens its details on tap and the quick comment sheet on long press. Screen readers get the long
// press as a named action, since the gesture itself is hidden from them.
export const Openable = ({
  target,
  title,
  children
}: {
  target: CommentTarget
  title: string
  children: ReactNode
}): React.JSX.Element => {
  const { t } = useT()
  const quick = useQuickComment()
  const comment = (): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    quick({ ...target, title })
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('seeDetails')}
      accessibilityActions={[{ name: 'longpress', label: t('commentQuick') }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && comment()}
      onPress={() => router.push(detailsHref(target))}
      onLongPress={comment}
      delayLongPress={350}
      className="rounded-[14px] data-[active=true]:opacity-80"
    >
      {children}
    </Pressable>
  )
}
