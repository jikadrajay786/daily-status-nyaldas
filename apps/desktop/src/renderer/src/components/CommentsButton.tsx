import type { CommentTarget } from '@daily-status/core/commentService'
import { useT } from '@daily-status/core/i18n'
import { MessageCircle } from 'lucide-react'
import { useOpenDetails } from '../lib/details'
import { Button } from './ui'

// Opens the details dialog; the count tells at a glance whether anyone has said something.
export const CommentsButton = ({
  target,
  count
}: {
  target: CommentTarget
  count: number | undefined
}): React.JSX.Element => {
  const { t } = useT()
  const open = useOpenDetails()
  return (
    <Button
      variant="ghost"
      onClick={() => open(target)}
      aria-label={count ? t('commentCount', { n: count }) : t('comments')}
    >
      <MessageCircle aria-hidden className="size-4" />
      {t('comments')}
      {!!count && <span className="tabular-nums">{count}</span>}
    </Button>
  )
}
