import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import type { DailyStatus } from '@daily-status/core/database.types'
import { fmtDate, nameOf } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { loadPlanBefore } from '@daily-status/core/richText'
import { getProfile, getStatus, updateStatus } from '@daily-status/core/statusService'
import { errMsg } from '@daily-status/core/useQuery'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useRef, useState, type RefObject } from 'react'
import { useWindowDimensions, type ScrollViewInstance } from 'react-native'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Text } from '@/components/gs/text'
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
    <Screen underHeader scrollRef={scroll}>
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
  // The editor runs in a WebView, so it gets the palette as resolved CSS variables rather than classes.
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
      <Text accessibilityRole="header" className="text-[18px] font-semibold text-fg">
        {title}
      </Text>
      <Text className="mt-1 text-[16px] font-semibold text-fg">{t('whatDidYouDo')}</Text>
      <Box onLayout={(e) => (editorY.current = e.nativeEvent.layout.y)}>
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
      </Box>
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
      <HStack className="flex-wrap gap-2">
        <Button onPress={submit} busy={save.state === 'saving'}>
          {t('saveChanges')}
        </Button>
        <Button variant="ghost" onPress={() => router.back()} disabled={save.state === 'saving'}>
          {t('cancel')}
        </Button>
      </HStack>
    </>
  )
}
