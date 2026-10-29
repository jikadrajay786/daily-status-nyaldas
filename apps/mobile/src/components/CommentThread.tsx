import {
  COMMENT_MAX,
  useCommentComposer,
  useDeleteComment,
  type CommentTarget
} from '@daily-status/core/commentService'
import type { Comment } from '@daily-status/core/database.types'
import { fmtAgo, initials, ROLE_KEY } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { MessageCircle, Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import { withUniwind } from 'uniwind'
import { HStack } from './gs/hstack'
import { Input, InputField } from './gs/input'
import { Pressable } from './gs/pressable'
import { Text } from './gs/text'
import { VStack } from './gs/vstack'
import { Avatar, Badge, Button, Notice } from './ui'
import { useProfile } from '@/lib/profile'

const TrashIcon = withUniwind(Trash2)
const BubbleIcon = withUniwind(MessageCircle)

const CommentRow = ({ c }: { c: Comment }): React.JSX.Element => {
  const { t, locale } = useT()
  const me = useProfile()
  const [confirming, setConfirming] = useState(false)
  const { error, busy, remove } = useDeleteComment(c.id)
  const mine = c.author_id === me.id

  return (
    <HStack className="gap-3">
      <Avatar text={initials({ full_name: c.author_name, email: null })} />
      <VStack className="flex-1 gap-1">
        <HStack className="flex-wrap items-center gap-x-2 gap-y-1">
          <Text className="text-[15px] font-semibold text-fg">
            {mine ? t('you') : c.author_name}
          </Text>
          {c.author_role !== 'user' && <Badge label={t(ROLE_KEY[c.author_role])} tone="info" />}
          <Text className="text-[13px] text-fg-3">{fmtAgo(c.created_at, t, locale)}</Text>
          {(mine || me.role === 'admin') && !confirming && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('commentDelete')}
              onPress={() => setConfirming(true)}
              className="ml-auto h-11 w-11 items-center justify-center"
            >
              <TrashIcon colorClassName="accent-fg-3" size={18} />
            </Pressable>
          )}
        </HStack>
        <Text selectable className="text-[16px] leading-[23px] text-fg">
          {c.body}
        </Text>
        {confirming && (
          <VStack className="mt-1 gap-2 rounded-[10px] border border-line p-3">
            <Text className="text-[15px] text-fg">{t('confirmDeleteComment')}</Text>
            <HStack className="flex-wrap gap-2">
              <Button variant="danger" busy={busy} onPress={() => void remove()}>
                {t('delete')}
              </Button>
              <Button variant="ghost" onPress={() => setConfirming(false)}>
                {t('cancel')}
              </Button>
            </HStack>
          </VStack>
        )}
        {error && <Notice tone="bad">{t(error)}</Notice>}
      </VStack>
    </HStack>
  )
}

export const CommentList = ({ comments }: { comments: readonly Comment[] }): React.JSX.Element => {
  const { t } = useT()
  return comments.length ? (
    <VStack className="gap-5">
      {comments.map((c) => (
        <CommentRow key={c.id} c={c} />
      ))}
    </VStack>
  ) : (
    <Text className="text-[15px] text-fg-2">{t('commentsEmpty')}</Text>
  )
}

export const CommentComposer = ({
  target,
  autoFocus = false,
  onSent
}: {
  target: CommentTarget
  autoFocus?: boolean
  onSent?: () => void
}): React.JSX.Element => {
  const { t } = useT()
  const { body, setBody, error, busy, send } = useCommentComposer(target, onSent)

  return (
    <VStack className="gap-2">
      <HStack className="items-end gap-2">
        <Input className="flex-1">
          <InputField
            accessibilityLabel={t('commentPlaceholder')}
            placeholder={t('commentPlaceholder')}
            placeholderTextColorClassName="accent-placeholder"
            selectionColorClassName="accent-accent-fg"
            value={body}
            onChangeText={setBody}
            maxLength={COMMENT_MAX}
            autoFocus={autoFocus}
            multiline
            className="max-h-32"
          />
        </Input>
        <Button busy={busy} disabled={!body.trim()} onPress={() => void send()}>
          {t('commentSend')}
        </Button>
      </HStack>
      {error && <Notice tone="bad">{t(error)}</Notice>}
    </VStack>
  )
}

// The small speech bubble with a number on cards; hidden until a thread has something in it.
export const CommentCount = ({ n }: { n: number | undefined }): React.JSX.Element | null => {
  const { t } = useT()
  return n ? (
    <HStack
      accessible
      accessibilityLabel={t('commentCount', { n })}
      className="items-center gap-1.5"
    >
      <BubbleIcon colorClassName="accent-fg-2" size={16} />
      <Text className="text-[14px] tabular-nums text-fg-2">{n}</Text>
    </HStack>
  ) : null
}
