import type { Profile } from '@daily-status/core/database.types'
import { nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { useState } from 'react'
import { FlatList, Modal } from 'react-native'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import { withUniwind } from 'uniwind'
import { HStack } from './gs/hstack'
import { Pressable } from './gs/pressable'
import { Text } from './gs/text'
import { VStack } from './gs/vstack'
import { Field } from './ui'

const SafeAreaView = withUniwind(RNSafeAreaView)
const ALL = { id: '', full_name: null, email: null } as const

// Desktop's member <select>, as a searchable list: a team can be too long to scroll through.
export const MemberPicker = ({
  members,
  value,
  onChange
}: {
  members: readonly Profile[]
  value: string
  onChange: (id: string) => void
}): React.JSX.Element => {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const picked = members.find((m) => m.id === value)
  const label = picked ? nameOf(picked) : t('allMembers')
  const needle = q.trim().toLowerCase()
  const rows = [
    ALL,
    ...members.filter(
      (m) => !needle || `${m.full_name ?? ''} ${m.email ?? ''}`.toLowerCase().includes(needle)
    )
  ]
  const close = (): void => {
    setOpen(false)
    setQ('')
  }

  return (
    <VStack className="gap-1.5">
      <Text className="text-[14px] font-medium text-fg-2">{t('roleMember')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('roleMember')}: ${label}`}
        onPress={() => setOpen(true)}
        className="min-h-12 flex-row items-center gap-2 rounded-[10px] border border-line bg-field px-3"
      >
        <Text numberOfLines={1} className="flex-1 text-[16px] text-fg">
          {label}
        </Text>
        <Text className="text-fg-3">▾</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView accessibilityViewIsModal className="flex-1 gap-3 bg-canvas p-4">
          <HStack className="items-center justify-between">
            <Text accessibilityRole="header" className="text-[20px] font-semibold text-fg">
              {t('roleMember')}
            </Text>
            <Pressable accessibilityRole="button" onPress={close} hitSlop={12}>
              {/* Bold on Android: a content-sized weight-600 label there loses its last letter. */}
              <Text className="text-[16px] font-semibold text-accent-fg android:font-bold">
                {t('close')}
              </Text>
            </Pressable>
          </HStack>
          <Field
            label={t('findPerson')}
            hideLabel
            value={q}
            onChangeText={setQ}
            placeholder={t('findPerson')}
            autoCorrect={false}
          />
          <FlatList
            data={rows}
            keyExtractor={(m) => m.id || 'all'}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: m }) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: m.id === value }}
                onPress={() => {
                  onChange(m.id)
                  close()
                }}
                className={`min-h-[52px] justify-center rounded-[10px] px-3 py-2 ${m.id === value ? 'bg-selected' : ''}`}
              >
                <Text className="text-[16px] text-fg">{m.id ? nameOf(m) : t('allMembers')}</Text>
                {m.email && <Text className="text-[13px] text-fg-3">{m.email}</Text>}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </VStack>
  )
}
