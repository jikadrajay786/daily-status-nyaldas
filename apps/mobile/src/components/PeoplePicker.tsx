import { initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import type { Assignee } from '@daily-status/core/taskService'
import { Check, X } from 'lucide-react-native'
import { useState } from 'react'
import { withUniwind } from 'uniwind'
import { Box } from './gs/box'
import { HStack } from './gs/hstack'
import { Pressable } from './gs/pressable'
import { Text } from './gs/text'
import { VStack } from './gs/vstack'
import { Avatar, Field } from './ui'

const CheckIcon = withUniwind(Check)
const XIcon = withUniwind(X)

const matches = (p: Assignee, needle: string): boolean =>
  !needle || `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(needle)

// Search, tick boxes and the picked people as removable chips, so a long staff list stays manageable.
export const PeoplePicker = ({
  people,
  picked,
  onChange
}: {
  people: readonly Assignee[]
  picked: ReadonlySet<string>
  onChange: (next: ReadonlySet<string>) => void
}): React.JSX.Element => {
  const { t } = useT()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = people.filter((p) => matches(p, needle))
  const chosen = people.filter((p) => picked.has(p.id))
  const toggle = (id: string): void =>
    onChange(new Set(picked.has(id) ? [...picked].filter((x) => x !== id) : [...picked, id]))
  const allShown = rows.length > 0 && rows.every((p) => picked.has(p.id))

  return (
    <VStack className="gap-3">
      <HStack className="items-center justify-between gap-3">
        <Text className="text-[14px] font-medium text-fg-2">{t('taskPeople')}</Text>
        <Text accessibilityLiveRegion="polite" className="text-[13px] text-fg-3">
          {chosen.length ? t('pickedCount', { n: chosen.length }) : t('taskPeopleHint')}
        </Text>
      </HStack>
      {chosen.length > 0 && (
        <HStack className="flex-wrap gap-2">
          {chosen.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={t('removePerson', { name: nameOf(p) })}
              onPress={() => toggle(p.id)}
              className="min-h-9 flex-row items-center gap-1.5 rounded-full bg-accent/15 py-1.5 pr-2.5 pl-3"
            >
              <Text className="text-[14px] font-medium text-accent-fg">{nameOf(p)}</Text>
              <XIcon colorClassName="accent-accent-fg" size={16} />
            </Pressable>
          ))}
        </HStack>
      )}
      {people.length > 6 && (
        <Field
          label={t('searchPeople')}
          hideLabel
          placeholder={t('searchPeople')}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
        />
      )}
      <VStack className="overflow-hidden rounded-[14px] border border-line bg-card">
        {rows.length > 1 && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              onChange(
                new Set(
                  allShown
                    ? [...picked].filter((id) => !rows.some((p) => p.id === id))
                    : [...picked, ...rows.map((p) => p.id)]
                )
              )
            }
            className="min-h-12 justify-center border-b border-line px-4"
          >
            <Text className="text-[15px] font-semibold text-accent-fg android:font-bold">
              {allShown ? t('clearAll') : t('pickAll')}
            </Text>
          </Pressable>
        )}
        {rows.length ? (
          rows.map((p, i) => {
            const on = picked.has(p.id)
            return (
              <Pressable
                key={p.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={nameOf(p)}
                onPress={() => toggle(p.id)}
                className={`min-h-14 flex-row items-center gap-3 px-4 py-2 ${i ? 'border-t border-line' : ''} ${on ? 'bg-selected' : ''}`}
              >
                <Avatar text={initials(p)} />
                <VStack className="flex-1">
                  <Text numberOfLines={1} className="text-[16px] text-fg">
                    {nameOf(p)}
                  </Text>
                  {p.full_name && p.email && (
                    <Text numberOfLines={1} className="text-[13px] text-fg-3">
                      {p.email}
                    </Text>
                  )}
                </VStack>
                <Box
                  className={`h-6 w-6 items-center justify-center rounded-md border-2 ${on ? 'border-accent bg-accent' : 'border-fg-3 bg-field'}`}
                >
                  {on && <CheckIcon colorClassName="accent-on-accent" size={16} strokeWidth={3} />}
                </Box>
              </Pressable>
            )
          })
        ) : (
          <Text className="px-4 py-3.5 text-[15px] text-fg-2">
            {people.length ? t('noPeopleMatch', { q: q.trim() }) : t('taskPeopleEmpty')}
          </Text>
        )}
      </VStack>
    </VStack>
  )
}
