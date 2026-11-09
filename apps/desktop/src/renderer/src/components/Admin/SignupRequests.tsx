import { fmtAgo, initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  useSignupDecision,
  useSignupRequests,
  type SignupChoice
} from '@daily-status/core/signupService'
import { useState } from 'react'
import { Avatar, Button, Card, Notice } from '../ui'

// Admins only. Hidden while nobody is waiting, so the People tab looks the same as before most days.
export const SignupRequests = (): React.JSX.Element => {
  const { t, locale } = useT()
  const list = useSignupRequests()
  const { run, busy, error } = useSignupDecision()
  const [doing, setDoing] = useState<{ id: string; choice: SignupChoice } | null>(null)
  const [said, setSaid] = useState('')
  // Outside the card, which goes away with the last request, taking the announcement with it.
  const status = (
    <p role="status" className="sr-only">
      {said}
    </p>
  )

  if (list.state !== 'ok' || !list.data.length) return status
  const decide = async (id: string, choice: SignupChoice, name: string): Promise<void> => {
    setDoing({ id, choice })
    if (await run({ id, choice }))
      setSaid(t(choice === 'approve' ? 'signupApproved' : 'signupDeclined', { name }))
    setDoing(null)
  }

  return (
    <>
      {status}
      <Card title={t('signupsTitle')} className="mb-6 w-full">
        <p className="mb-4 text-sm text-fg-2">{t('signupsHint')}</p>
        <ul className="flex flex-col divide-y divide-line">
          {list.data.map((r) => {
            const name = nameOf({ full_name: r.full_name, email: r.email })
            const mine = doing?.id === r.user_id
            return (
              <li key={r.user_id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar text={initials({ full_name: r.full_name, email: r.email })} />
                <div className="min-w-0 flex-[1_1_12rem]">
                  <p className="font-medium text-fg">{name}</p>
                  <p className="text-sm break-all text-fg-2">
                    {r.email} · {fmtAgo(r.created_at, t, locale)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    busy={mine && doing.choice === 'approve'}
                    disabled={busy}
                    onClick={() => void decide(r.user_id, 'approve', name)}
                  >
                    {t('signupApprove')}
                  </Button>
                  <Button
                    variant="danger"
                    busy={mine && doing.choice === 'decline'}
                    disabled={busy}
                    onClick={() => void decide(r.user_id, 'decline', name)}
                  >
                    {t('signupDecline')}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
        {error && <Notice tone="bad">{t(error)}</Notice>}
      </Card>
    </>
  )
}
