import type { DailyStatus, Profile } from '@daily-status/core/database.types'
import { fmtDate, fmtHours, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { wasEdited } from '@daily-status/core/statusService'
import type { ReactNode } from 'react'
import { Box } from './gs/box'
import { HStack } from './gs/hstack'
import { Text } from './gs/text'
import { CommentCount } from './CommentThread'
import { RichText } from './RichText'
import { Badge, Card, Loading, Skeleton } from './ui'

// The date and badges row; the skeleton uses it too so loading cards have the same shape.
const HEAD = 'flex-wrap items-center justify-between gap-2'

export const StatusCard = ({
  status: st,
  author,
  actions,
  comments
}: {
  status: DailyStatus
  // Team feed cards say whose update it is; a person's own cards don't.
  author?: Pick<Profile, 'full_name' | 'email'> | null
  actions?: ReactNode
  comments?: number
}): React.JSX.Element => {
  const { t, locale } = useT()
  return (
    <Card>
      {author !== undefined && (
        <Box>
          <Text numberOfLines={1} className="text-[15px] font-semibold text-fg">
            {nameOf(author)}
          </Text>
          {author?.email && (
            <Text numberOfLines={1} className="text-[13px] text-fg-3">
              {author.email}
            </Text>
          )}
        </Box>
      )}
      <HStack className={HEAD}>
        <Text className="text-[15px] text-fg-2">{fmtDate(st.date, locale)}</Text>
        {wasEdited(st) && (
          <Box
            accessible
            accessibilityLabel={t('editedAt', {
              when: new Date(st.updated_at).toLocaleString(locale, {
                dateStyle: 'medium',
                timeStyle: 'short'
              })
            })}
          >
            <Badge label={t('edited')} tone="idle" />
          </Box>
        )}
        <Badge label={fmtHours(st.hours_logged, t)} tone="info" />
      </HStack>
      <RichText html={st.description} />
      {(actions || !!comments) && (
        <HStack className="flex-wrap items-center gap-2">
          <CommentCount n={comments} />
          <HStack className="ml-auto flex-wrap justify-end gap-2">{actions}</HStack>
        </HStack>
      )}
    </Card>
  )
}

export const CardsSkeleton = ({ count = 3 }: { count?: number }): React.JSX.Element => (
  <Loading>
    {Array.from({ length: count }, (_, i) => (
      <Card key={i}>
        <HStack className={HEAD}>
          <Skeleton width={140} />
          <Skeleton width={44} height={22} />
        </HStack>
        <Skeleton width="90%" />
        <Skeleton width="70%" />
      </Card>
    ))}
  </Loading>
)
