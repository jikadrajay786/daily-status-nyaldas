import { fmtAgo, initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  useSignupDecision,
  useSignupRequests,
  type SignupChoice
} from '@daily-status/core/signupService'
import { useState } from 'react'
import { HStack } from '@/components/gs/hstack'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { Avatar, Button, Card, Notice } from '@/components/ui'
import { useAnnounce } from '@/lib/announce'

// Admins only, at the top of Team. Hidden while nobody is waiting.
export const SignupRequests = (): React.JSX.Element | null => {
  const { t, locale } = useT()
  const list = useSignupRequests()
  const { run, busy, error } = useSignupDecision()
  const [doing, setDoing] = useState<{ id: string; choice: SignupChoice } | null>(null)
  const [said, setSaid] = useState<string>()
  useAnnounce(said)

  if (list.state !== 'ok' || !list.data.length) return null
  const decide = async (id: string, choice: SignupChoice, name: string): Promise<void> => {
    setDoing({ id, choice })
    if (await run({ id, choice }))
      setSaid(t(choice === 'approve' ? 'signupApproved' : 'signupDeclined', { name }))
    setDoing(null)
  }

  return (
    <Card className="gap-3">
      <Text className="text-[17px] font-semibold text-fg android:font-bold">
        {t('signupsTitle')}
      </Text>
      <Text className="text-[14px] text-fg-2">{t('signupsHint')}</Text>
      {list.data.map((r) => {
        const name = nameOf({ full_name: r.full_name, email: r.email })
        const mine = doing?.id === r.user_id
        return (
          <VStack key={r.user_id} className="gap-3 border-t border-line pt-3">
            <HStack className="items-center gap-3">
              <Avatar text={initials({ full_name: r.full_name, email: r.email })} />
              <VStack className="flex-1 gap-0.5">
                <Text className="text-[16px] font-medium text-fg">{name}</Text>
                <Text className="text-[13px] text-fg-2">
                  {`${r.email} · ${fmtAgo(r.created_at, t, locale)}`}
                </Text>
              </VStack>
            </HStack>
            <HStack className="flex-wrap gap-2">
              <Button
                busy={mine && doing.choice === 'approve'}
                disabled={busy}
                onPress={() => void decide(r.user_id, 'approve', name)}
              >
                {t('signupApprove')}
              </Button>
              <Button
                variant="danger"
                busy={mine && doing.choice === 'decline'}
                disabled={busy}
                onPress={() => void decide(r.user_id, 'decline', name)}
              >
                {t('signupDecline')}
              </Button>
            </HStack>
          </VStack>
        )
      })}
      {error && <Notice tone="bad">{t(error)}</Notice>}
    </Card>
  )
}
