import type { Profile } from '@daily-status/core/database.types'
import { nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import { Field } from './ui'

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
  const { colors: c } = useTheme()
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
    <View style={s.field}>
      <Text style={[s.label, { color: c.fg2 }]}>{t('roleMember')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('roleMember')}: ${label}`}
        onPress={() => setOpen(true)}
        style={[s.button, { backgroundColor: c.field, borderColor: c.line }]}
      >
        <Text numberOfLines={1} style={[s.value, { color: c.fg }]}>
          {label}
        </Text>
        <Text style={{ color: c.fg3 }}>▾</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView accessibilityViewIsModal style={[s.sheet, { backgroundColor: c.canvas }]}>
          <View style={s.top}>
            <Text accessibilityRole="header" style={[s.title, { color: c.fg }]}>
              {t('roleMember')}
            </Text>
            <Pressable accessibilityRole="button" onPress={close} hitSlop={12}>
              <Text style={[s.close, { color: c.accentFg }]}>{t('close')}</Text>
            </Pressable>
          </View>
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
                style={[s.row, m.id === value && { backgroundColor: c.selected }]}
              >
                <Text style={[s.name, { color: c.fg }]}>{m.id ? nameOf(m) : t('allMembers')}</Text>
                {m.email && <Text style={[s.email, { color: c.fg3 }]}>{m.email}</Text>}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500' },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  value: { flex: 1, fontSize: 16 },
  sheet: { flex: 1, padding: 16, gap: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '600' },
  close: { fontSize: 16, fontWeight: '600' },
  row: {
    minHeight: 52,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center'
  },
  name: { fontSize: 16 },
  email: { fontSize: 13 }
})
