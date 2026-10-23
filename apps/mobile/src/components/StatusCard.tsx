import type { DailyStatus, Profile } from '@daily-status/core/database.types'
import { fmtDate, fmtHours, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'
import { RichText } from './RichText'
import { Badge, Card, Loading, Skeleton } from './ui'

export const StatusCard = ({
  status: st,
  author,
  actions
}: {
  status: DailyStatus
  // Team feed cards say whose update it is; a person's own cards don't.
  author?: Pick<Profile, 'full_name' | 'email'> | null
  actions?: ReactNode
}): React.JSX.Element => {
  const { t, locale } = useT()
  const { colors } = useTheme()
  return (
    <Card>
      {author !== undefined && (
        <View>
          <Text numberOfLines={1} style={[s.author, { color: colors.fg }]}>
            {nameOf(author)}
          </Text>
          {author?.email && (
            <Text numberOfLines={1} style={[s.email, { color: colors.fg3 }]}>
              {author.email}
            </Text>
          )}
        </View>
      )}
      <View style={s.head}>
        <Text style={[s.date, { color: colors.fg2 }]}>{fmtDate(st.date, locale)}</Text>
        <Badge label={fmtHours(st.hours_logged, t)} tone="info" />
      </View>
      <RichText html={st.description} />
      {actions && <View style={s.actions}>{actions}</View>}
    </Card>
  )
}

export const CardsSkeleton = ({ count = 3 }: { count?: number }): React.JSX.Element => (
  <Loading>
    {Array.from({ length: count }, (_, i) => (
      <Card key={i}>
        <View style={s.head}>
          <Skeleton width={140} />
          <Skeleton width={44} height={22} />
        </View>
        <Skeleton width="90%" />
        <Skeleton width="70%" />
      </Card>
    ))}
  </Loading>
)

const s = StyleSheet.create({
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  date: { fontSize: 15 },
  author: { fontSize: 15, fontWeight: '600' },
  email: { fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }
})
