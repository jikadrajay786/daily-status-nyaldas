import type { DirectoryEntry } from '@daily-status/core/adminService'
import { isLead, nameOf, ROLE_EFFECT, ROLE_KEY, ROLES } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { useReportsTo, useRoleChange } from '@daily-status/core/useRoleChange'
import { HStack } from '@/components/gs/hstack'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { Button, Notice, Segmented } from '@/components/ui'

type Props = { person: DirectoryEntry; me: string; leads: DirectoryEntry[] }

const NOBODY = 'nobody'

const ReportsTo = ({ person, leads }: Omit<Props, 'me'>): React.JSX.Element => {
  const { t } = useT()
  const { saved, error, pick } = useReportsTo(person)
  return (
    <VStack className="gap-3">
      <Text className="text-[14px] font-medium text-fg-2">{t('reportsTo')}</Text>
      {leads.length ? (
        <Segmented
          scroll
          label={t('reportsTo')}
          options={[
            [NOBODY, t('reportsNobody')] as const,
            ...leads.map((l) => [l.id, nameOf(l)] as const)
          ]}
          value={person.reports_to ?? NOBODY}
          onChange={(v) => void pick(v === NOBODY ? null : v)}
        />
      ) : (
        <Text className="text-[14px] text-fg-2">{t('reportsNoLeads')}</Text>
      )}
      {error && <Notice tone="bad">{t(error)}</Notice>}
      {saved && <Notice tone="ok">{t('reportsChanged')}</Notice>}
    </VStack>
  )
}

export const RolePicker = ({ person, me, leads }: Props): React.JSX.Element => {
  const { t } = useT()
  const { next, saved, error, busy, pick, confirm } = useRoleChange(person)
  if (person.id === me) return <Text className="text-[14px] text-fg-2">{t('roleOwnHint')}</Text>

  return (
    <VStack className="gap-3">
      <Text className="text-[14px] font-medium text-fg-2">{t('roleLabel')}</Text>
      <Segmented
        label={t('roleLabel')}
        options={ROLES.map((r) => [r, t(ROLE_KEY[r])] as const)}
        value={next ?? person.role}
        onChange={pick}
      />
      {next && (
        <VStack className="gap-2">
          <Text className="text-[15px] font-medium text-fg">
            {t('roleConfirm', { name: nameOf(person), role: t(ROLE_KEY[next]) })}
          </Text>
          <Text className="text-[14px] text-fg-2">{t(ROLE_EFFECT[next])}</Text>
          {isLead(person.role) && (
            <Text className="text-[14px] text-fg-2">{t('roleEffectUnlink')}</Text>
          )}
          <HStack className="flex-wrap justify-end gap-2">
            <Button variant="ghost" onPress={() => pick(person.role)}>
              {t('cancel')}
            </Button>
            <Button busy={busy} onPress={() => void confirm()}>
              {t('roleYes')}
            </Button>
          </HStack>
        </VStack>
      )}
      {error && <Notice tone="bad">{t(error)}</Notice>}
      {saved && <Notice tone="ok">{t('roleChanged')}</Notice>}
      {person.role === 'user' && !next && <ReportsTo person={person} leads={leads} />}
    </VStack>
  )
}
