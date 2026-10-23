import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import type { DailyStatus } from '@daily-status/core/database.types'
import { fmtDate, nameOf } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { loadPlanBefore } from '@daily-status/core/richText'
import { getProfile, getStatus, updateStatus } from '@daily-status/core/statusService'
import { errMsg } from '@daily-status/core/useQuery'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useRef, useState, type RefObject } from 'react'
import { StyleSheet, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native'
import { HoursField } from '@/components/HoursField'
import { Button, Loading, Notice, Screen, Skeleton } from '@/components/ui'
import EditorPage from '@/dom/EditorPage'
import {
  editorFontScale,
  setWriteLang,
  useEditorContent,
  useEditorFit,
  useWriteLang
} from '@/lib/editor'
import { hoursError, parseHours } from '@/lib/hours'
import { uuidParam } from '@/lib/route'
import { cssVars, useTheme } from '@/lib/theme'

type Loaded = { status: DailyStatus; name: string } | null

// Admin correction of someone else's update. The date stays fixed, so it can't collide with another day.
export default function EditStatus(): React.JSX.Element {
  const { t, locale } = useT()
  const id = uuidParam(useLocalSearchParams<{ statusId: string }>().statusId)
  const scroll = useRef<ScrollViewInstance>(null)
  const [data] = useLiveQuery<Loaded>(`status:${id}`, async () => {
    const status = id ? await getStatus(id) : null
    return status ? { status, name: nameOf(await getProfile(status.user_id)) } : null
  })

  return (
    <Screen scrollRef={scroll}>
      {data.state === 'loading' ? (
        <Loading>
          <Skeleton width="80%" height={18} />
          <Skeleton width="100%" height={320} />
        </Loading>
      ) : data.state === 'error' ? (
        <Notice tone="bad">{t(data.message)}</Notice>
      ) : data.data ? (
        <Form
          scroll={scroll}
          status={data.data.status}
          name={data.data.name}
          title={t('editingFor', {
            name: data.data.name,
            date: fmtDate(data.data.status.date, locale)
          })}
        />
      ) : (
        <Notice>{t('notFound')}</Notice>
      )}
    </Screen>
  )
}

type Save = { state: 'idle' } | { state: 'saving' } | { state: 'error'; message: Key }

const Form = ({
  scroll,
  status,
  title
}: {
  scroll: RefObject<ScrollViewInstance | null>
  status: DailyStatus
  name: string
  title: string
}): React.JSX.Element => {
  const { t, lang } = useT()
  const { colors } = useTheme()
  const { fontScale } = useWindowDimensions()
  const editorY = useRef(0)
  const fit = useEditorFit(scroll, () => editorY.current)
  const writeLang = useWriteLang(lang)
  const vars = useMemo(() => cssVars(colors), [colors])
  const { editor, onChange, flush } = useEditorContent()
  const [hours, setHours] = useState(String(status.hours_logged))
  const [hoursErr, setHoursErr] = useState<string>()
  const [save, setSave] = useState<Save>({ state: 'idle' })

  const submit = async (): Promise<void> => {
    setSave({ state: 'saving' })
    const c = await flush()
    if (c.empty) return setSave({ state: 'error', message: 'writeFirst' })
    const bad = hoursError(hours)
    if (bad) {
      setSave({ state: 'idle' })
      return setHoursErr(t(...bad))
    }
    try {
      // By id, never the upsert: an upsert runs the insert policy, which only allows your own rows.
      await updateStatus(status.id, { description: c.html, hours_logged: parseHours(hours) })
      // Back first: bumping changes this screen's own query key, which would flash its skeleton.
      router.back()
      bumpLive()
    } catch (err) {
      setSave({ state: 'error', message: errMsg(err) })
    }
  }

  return (
    <>
      <Text accessibilityRole="header" style={[s.title, { color: colors.fg }]}>
        {title}
      </Text>
      <Text style={[s.label, { color: colors.fg }]}>{t('whatDidYouDo')}</Text>
      <View onLayout={(e) => (editorY.current = e.nativeEvent.layout.y)}>
        <EditorPage
          ref={editor}
          docKey={status.id}
          initialHtml={status.description}
          lang={lang}
          vars={vars}
          fontScale={editorFontScale(fontScale)}
          initialWriteLang={writeLang}
          onWriteLangChange={async (l) => setWriteLang(l)}
          onChange={onChange}
          loadPlan={() => loadPlanBefore(status.user_id, status.date)}
          onEditorFocus={fit.onEditorFocus}
          typing={fit.typing}
          minHeight={fit.rest}
          onContentHeight={fit.onContentHeight}
          // At rest a drag on the editor scrolls the screen; only while typing does it scroll the writing area.
          dom={{
            nestedScrollEnabled: fit.typing,
            scrollEnabled: fit.typing,
            style: { height: fit.height }
          }}
        />
      </View>
      <HoursField
        value={hours}
        onChange={(h) => {
          setHours(h)
          setHoursErr(undefined)
        }}
        onFocus={() => editor.current?.blur()}
        {...(hoursErr && { error: hoursErr })}
      />
      {save.state === 'error' && <Notice tone="bad">{t(save.message)}</Notice>}
      <View style={s.actions}>
        <Button onPress={submit} disabled={save.state === 'saving'}>
          {save.state === 'saving' ? t('saving') : t('saveChanges')}
        </Button>
        <Button variant="ghost" onPress={() => router.back()}>
          {t('cancel')}
        </Button>
      </View>
    </>
  )
}

const s = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600' },
  label: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }
})
