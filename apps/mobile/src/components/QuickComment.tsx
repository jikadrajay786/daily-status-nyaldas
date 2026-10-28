import { useT } from '@daily-status/core/i18n'
import { router } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { detailsHref, QuickCommentContext, type QuickTarget } from '@/lib/quickComment'
import { CommentComposer } from './CommentThread'
import { Box } from './gs/box'
import { Text } from './gs/text'
import { VStack } from './gs/vstack'
import { Button } from './ui'

// A bottom sheet for a quick comment from a long-pressed card, with a way through to the full details.
export const QuickCommentProvider = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const { t } = useT()
  const { bottom } = useSafeAreaInsets()
  const [target, setTarget] = useState<QuickTarget | null>(null)
  const close = (): void => setTarget(null)

  return (
    <QuickCommentContext value={setTarget}>
      {children}
      <Modal
        visible={!!target}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={close}
      >
        <KeyboardAvoidingView behavior="padding" className="flex-1 justify-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
            onPress={close}
            className="absolute inset-0 bg-scrim"
          />
          {target && (
            <VStack
              accessibilityViewIsModal
              className="gap-4 rounded-t-[22px] bg-card px-5 pt-3"
              style={{ paddingBottom: Math.max(bottom, 16) + 8 }}
            >
              <Box className="h-1 w-10 self-center rounded-full bg-line" />
              <VStack className="gap-1">
                <Text className="text-[13px] font-medium text-fg-3">{t('commentQuick')}</Text>
                <Text
                  accessibilityRole="header"
                  numberOfLines={2}
                  className="text-[17px] font-semibold text-fg"
                >
                  {target.title}
                </Text>
              </VStack>
              <CommentComposer
                target={target}
                autoFocus
                onSent={() => {
                  // Announced directly: the sheet is gone, and every send must be heard, not just the first.
                  AccessibilityInfo.announceForAccessibility(t('commentSent'))
                  close()
                }}
              />
              <Button
                variant="ghost"
                onPress={() => {
                  close()
                  router.push(detailsHref(target))
                }}
              >
                {t('seeDetails')}
              </Button>
            </VStack>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </QuickCommentContext>
  )
}
