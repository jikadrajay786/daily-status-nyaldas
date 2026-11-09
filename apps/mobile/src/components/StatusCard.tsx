import type { DailyStatus, Profile } from '@daily-status/core/database.types'
import { fmtDate, fmtHours, initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { fmtStatusTimes, wasEdited } from '@daily-status/core/statusService'
import { ChevronRight } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { withUniwind } from 'uniwind'
import { Box } from './gs/box'
import { HStack } from './gs/hstack'
import { Text } from './gs/text'
import { CommentCount } from './CommentThread'
import { Openable } from './Openable'
import { RichText } from './RichText'
import { Avatar, Badge, Card, Loading, Skeleton } from './ui'

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
        {wasEdited(st) && <Badge label={t('edited')} tone="idle" />}
        <Badge label={fmtHours(st.hours_logged, t)} tone="info" />
      </HStack>
      <RichText html={st.description} />
      <Text className="text-[13px] text-fg-3">{fmtStatusTimes(st, t, locale)}</Text>
      {(actions || !!comments) && (
        <HStack className="flex-wrap items-center gap-2">
          <CommentCount n={comments} />
          <HStack className="ml-auto flex-wrap justify-end gap-2">{actions}</HStack>
        </HStack>
      )}
    </Card>
  )
}

const NextIcon = withUniwind(ChevronRight)

// A team feed card: who, when and two lines; a tap on the whole card (Openable) opens the rest.
export const TeamUpdateCard = ({
  status: st,
  author,
  comments
}: {
  status: DailyStatus
  author: Pick<Profile, 'full_name' | 'email'> | null
  comments?: number
}): React.JSX.Element => {
  const { t, locale } = useT()
  return (
    <Card>
      <HStack className="items-center gap-3">
        <Avatar text={initials(author ?? { full_name: null, email: null })} />
        <Box className="flex-1">
          <Text numberOfLines={1} className="text-[15px] font-semibold text-fg android:font-bold">
            {nameOf(author)}
          </Text>
          <Text className="text-[13px] text-fg-2">
            {fmtDate(st.date, locale)} · {fmtHours(st.hours_logged, t)}
          </Text>
        </Box>
        {wasEdited(st) && <Badge label={t('edited')} tone="idle" />}
        <CommentCount n={comments} />
      </HStack>
      <Text numberOfLines={2} className="text-[15px] leading-[22px] text-fg-2">
        {st.description_text.replace(/\s+/g, ' ').trim()}
      </Text>
      <HStack className="items-center gap-0.5">
        <Text className="text-[14px] font-medium text-accent-fg">{t('seeDetails')}</Text>
        <NextIcon colorClassName="accent-accent-fg" size={16} />
      </HStack>
    </Card>
  )
}

// One line of a short list: the whole update, comments and Edit are a tap away in its details.
export const StatusRow = ({
  status: st,
  first
}: {
  status: DailyStatus
  first: boolean
}): React.JSX.Element => {
  const { t, locale } = useT()
  return (
    <Openable target={{ kind: 'status', id: st.id }} title={fmtDate(st.date, locale)}>
      <HStack
        className={`min-h-14 items-center gap-3 py-2.5 ${first ? '' : 'border-t border-line'}`}
      >
        <Text className="min-w-14 text-[14px] font-semibold text-fg android:font-bold">
          {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
            new Date(`${st.date}T00:00`)
          )}
        </Text>
        <Text numberOfLines={1} className="flex-1 text-[15px] text-fg-2">
          {st.description_text}
        </Text>
        <Text className="text-[13px] font-medium text-fg-2">{fmtHours(st.hours_logged, t)}</Text>
        <NextIcon colorClassName="accent-fg-3" size={18} />
      </HStack>
    </Openable>
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
