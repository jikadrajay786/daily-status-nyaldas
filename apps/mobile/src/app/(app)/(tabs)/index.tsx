import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import type { DailyStatus } from '@daily-status/core/database.types'
import { fmtDate, fmtHours, fmtStamp } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { loadPlanBefore, parseDraft, type Draft } from '@daily-status/core/richText'
import {
  addStatus,
  canChange,
  hoursLeft,
  listMyDay,
  listMyStatuses,
  updateStatus
} from '@daily-status/core/statusService'
import { today } from '@daily-status/core/supabase'
import { useDayOff } from '@daily-status/core/holidayService'
import { errMsg } from '@daily-status/core/useQuery'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, useWindowDimensions, type ScrollViewInstance } from 'react-native'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { HoursField } from '@/components/HoursField'
import { DateField } from '@/components/DateField'
import { CardsSkeleton, StatusCard, StatusRow } from '@/components/StatusCard'
import {
  Badge,
  Button,
  Card,
  Link,
  Loading,
  Notice,
  Screen,
  Skeleton,
  Title
} from '@/components/ui'
import EditorPage from '@/dom/EditorPage'
import {
  editorFontScale,
  setWriteLang,
  useEditorContent,
  useEditorFit,
  useWriteLang
} from '@/lib/editor'
import { hoursError, parseHours } from '@/lib/hours'
import { useProfile } from '@/lib/profile'
import { usePullToRefresh } from '@/lib/refresh'
import { markToday } from '@/lib/reminder'
import { prefs } from '@/lib/storage'
import { cssVars, useTheme } from '@/lib/theme'

// A `date` in the route (History's Edit, or a dailystatus:// link) must be a real past-or-today date.
const validDate = (d: string | undefined): string | null =>
  d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && d <= today() ? d : null

type Save = { state: 'idle' } | { state: 'saving' } | { state: 'error'; message: Key }
type Form = { key: string; row: DailyStatus | null; draft: Draft | null; hours: string }

export default function Today(): React.JSX.Element {
  const { t, locale, lang } = useT()
  const { colors } = useTheme()
  const { fontScale } = useWindowDimensions()
  const profile = useProfile()
  const params = useLocalSearchParams<{ date?: string; edit?: string }>()
  const date = validDate(params.date) ?? today()
  // `edit` is an update's id (History's and the details screen's Edit buttons), or `new` to add another one.
  const adding = params.edit === 'new'
  const [saved, setSaved] = useState<string | null>(null)
  const setDate = (d: string, edit = ''): void => {
    setSaved(null)
    router.setParams({ date: d, edit })
  }

  const [day, , dayRefreshing] = useLiveQuery(`mine:${profile.id}:${date}`, () =>
    listMyDay(profile.id, date)
  )
  const rows = day.state === 'ok' ? day.data : []
  const editRow = rows.find((r) => r.id === params.edit) ?? null
  const left = hoursLeft(rows, editRow?.id)
  // A first update starts at a full day; another starts at whatever the day still has room for, up to that.
  const startHours = String(editRow?.hours_logged ?? Math.max(0, Math.min(8, left)))
  const [recent, , recentRefreshing] = useLiveQuery(`recent:${profile.id}`, () =>
    listMyStatuses(profile.id, '', 3).then(({ rows }) => rows)
  )
  const [resets, setResets] = useState(0)
  const pull = usePullToRefresh(
    day.state === 'loading' || recent.state === 'loading' || dayRefreshing || recentRefreshing,
    bumpLive
  )
  const draftKey = `draft:${profile.id}:${date}${editRow ? `:${editRow.id}` : ''}`

  // A new date, a save or "Start over" resets the form, but the editor's WebView stays mounted: only its document
  // is swapped (docKey), which is much faster than reloading the page.
  const [form, setForm] = useState<Form | null>(null)
  const [save, setSave] = useState<Save>({ state: 'idle' })
  const [hoursErr, setHoursErr] = useState<string>()
  const writeLang = useWriteLang(lang)
  const key =
    day.state === 'ok'
      ? `${date}:${editRow ? `${editRow.id}:${editRow.updated_at}` : `new:${rows.length}`}:${resets}`
      : null
  if (day.state === 'ok' && key && form?.key !== key) {
    const draft = parseDraft(prefs.get(draftKey))
    setForm({ key, row: editRow, draft, hours: draft?.hours ?? startHours })
    setSave({ state: 'idle' })
    setHoursErr(undefined)
  }

  const hoursNow = useRef('')
  useEffect(() => {
    hoursNow.current = form?.hours ?? ''
  }, [form?.hours])
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const savedHours = startHours
  const { off: dayOff, holiday } = useDayOff(date)
  const locked = rows.length > 0 && !canChange(date, profile.role)
  // Once submitted the form closes and empties; Edit reopens it filled with what was saved, and Add another opens it
  // empty. An unsaved draft means someone was mid-way when they left, so the form stays open with their words.
  const closed = locked || (rows.length > 0 && !form?.row && !adding && !form?.draft)
  const writeDraft = (html: string, hours: string): void =>
    prefs.set(draftKey, JSON.stringify({ html, hours } satisfies Draft))
  // Drafts are written on a short debounce: the OS can close the app at any moment.
  const { editor, content, onChange, flush } = useEditorContent((c) => {
    clearTimeout(timer.current)
    // Emptied again with nothing else changed: no "unsaved changes" to keep.
    timer.current = setTimeout(
      () =>
        c.empty && !form?.row && hoursNow.current === savedHours
          ? prefs.remove(draftKey)
          : writeDraft(c.html, hoursNow.current),
      300
    )
  })

  const setHours = (h: string): void => {
    if (!form) return
    setForm({ ...form, hours: h })
    setHoursErr(undefined)
    if (content.current.edited || h !== savedHours) writeDraft(content.current.html, h)
  }

  const scroll = useRef<ScrollViewInstance>(null)
  const formY = useRef(0)
  const fieldsY = useRef(0)
  const editorY = useRef(0)
  const fit = useEditorFit(scroll, () => formY.current + fieldsY.current + editorY.current)
  // The editor runs in a WebView, so it gets the palette as resolved CSS variables rather than classes.
  const vars = useMemo(() => cssVars(colors), [colors])

  const submit = async (): Promise<void> => {
    if (!form) return
    setSave({ state: 'saving' })
    const c = await flush()
    if (c.empty) return setSave({ state: 'error', message: 'writeFirst' })
    const bad = hoursError(form.hours)
    if (bad) {
      setSave({ state: 'idle' })
      return setHoursErr(t(...bad))
    }
    if (parseHours(form.hours) > left) {
      setSave({ state: 'idle' })
      return setHoursErr(t('hoursOverDay', { left: Math.max(0, left) }))
    }
    try {
      clearTimeout(timer.current)
      const entry = { description: c.html, hours_logged: parseHours(form.hours) }
      await (form.row
        ? updateStatus(form.row.id, entry)
        : addStatus(profile.id, { ...entry, date }))
      prefs.remove(draftKey)
      if (date === today()) markToday(profile.id, true)
      setSave({ state: 'idle' })
      router.setParams({ edit: '' })
      setSaved(date)
      bumpLive()
    } catch (err) {
      setSave({ state: 'error', message: errMsg(err) })
    }
  }

  const discard = (): void => {
    prefs.remove(draftKey)
    setResets((n) => n + 1)
  }

  const cancelEdit = (): void => {
    editor.current?.blur()
    discard()
    setDate(date)
  }

  return (
    <Screen
      scrollRef={scroll}
      refreshControl={<RefreshControl {...pull} />}
      header={
        <Title action={<DateField value={date} onChange={setDate} hideLabel pill />}>
          {t('navToday')}
        </Title>
      }
    >
      <VStack onLayout={(e) => (formY.current = e.nativeEvent.layout.y)} className="gap-3.5">
        {day.state === 'error' && <Notice tone="bad">{t(day.message)}</Notice>}
        {/* A failed refresh keeps the form: removing it would tear down the WebView and the words in it. */}
        {!form ? (
          day.state !== 'error' && <FormSkeleton />
        ) : (
          <>
            {locked && <Notice>{t('statusLocked')}</Notice>}
            {saved === date && closed && !locked && (
              <Notice tone="ok">{t('savedDone', { date: fmtDate(date, locale) })}</Notice>
            )}
            {rows.length > 1 && (
              <Text className="text-[14px] font-medium text-fg-2">
                {t('dayTotal', {
                  n: rows.length,
                  hours: fmtHours(
                    rows.reduce((sum, r) => sum + r.hours_logged, 0),
                    t
                  )
                })}
              </Text>
            )}
            {rows
              .filter((r) => r.id !== form.row?.id)
              .map((r) => (
                <StatusCard
                  key={r.id}
                  status={r}
                  actions={
                    !locked &&
                    closed && (
                      <Button variant="ghost" onPress={() => setDate(date, r.id)}>
                        {t('edit')}
                      </Button>
                    )
                  }
                />
              ))}
            {closed && !locked && (
              <Button variant="ghost" onPress={() => setDate(date, 'new')}>
                {t('addAnotherUpdate')}
              </Button>
            )}
            {/* Locked dates collapse the form instead of removing it: unmounting (or display:none, which Fabric
                also detaches) tears down the editor's WebView while its calls are in flight. */}
            <VStack
              onLayout={(e) => (fieldsY.current = e.nativeEvent.layout.y)}
              className={`gap-4 ${closed ? 'h-0 overflow-hidden opacity-0' : ''}`}
              pointerEvents={closed ? 'none' : 'auto'}
              accessibilityElementsHidden={closed}
              importantForAccessibility={closed ? 'no-hide-descendants' : 'auto'}
            >
              <HStack className="flex-wrap items-center gap-2">
                {(form.row || !rows.length) && (
                  <Badge
                    label={
                      form.row
                        ? t('submittedAt', { when: fmtStamp(form.row.updated_at, locale) })
                        : holiday
                          ? t('holidayBadge', { name: holiday })
                          : dayOff
                            ? t('dayOffBadge')
                            : t('notSubmitted')
                    }
                    tone={form.row ? 'ok' : dayOff ? 'info' : 'warn'}
                  />
                )}
                {form.draft && (
                  <>
                    <Badge label={t('draftKept')} tone="info" />
                    <Link onPress={discard}>{t('startOver')}</Link>
                  </>
                )}
              </HStack>
              <Text accessibilityRole="header" className="-mb-2 text-[16px] font-semibold text-fg">
                {t('whatDidYouDo')}
              </Text>
              <Box onLayout={(e) => (editorY.current = e.nativeEvent.layout.y)}>
                <EditorPage
                  ref={editor}
                  docKey={form.key}
                  initialHtml={form.draft?.html ?? form.row?.description ?? ''}
                  lang={lang}
                  vars={vars}
                  fontScale={editorFontScale(fontScale)}
                  initialWriteLang={writeLang}
                  onWriteLangChange={async (l) => setWriteLang(l)}
                  onChange={onChange}
                  loadPlan={() => loadPlanBefore(profile.id, date)}
                  onEditorFocus={fit.onEditorFocus}
                  typing={fit.typing}
                  minHeight={fit.rest}
                  onContentHeight={fit.onContentHeight}
                  onOverflow={fit.onOverflow}
                  // At rest a drag on the editor scrolls the screen; it scrolls the writing area only once the text has outgrown it.
                  dom={{
                    nestedScrollEnabled: fit.scrollInside,
                    scrollEnabled: fit.scrollInside,
                    style: { height: fit.height }
                  }}
                />
              </Box>
              <HoursField
                value={form.hours}
                onChange={setHours}
                // Typing hours leaves the writing area, so a pending Write-in word converts now.
                onFocus={() => editor.current?.blur()}
                {...(hoursErr && { error: hoursErr })}
                action={
                  <Button onPress={submit} busy={save.state === 'saving'}>
                    {t(form.row ? 'saveChanges' : 'submit')}
                  </Button>
                }
              />
              {save.state === 'error' && <Notice tone="bad">{t(save.message)}</Notice>}
              {rows.length > 0 && (
                <Button variant="ghost" onPress={cancelEdit} disabled={save.state === 'saving'}>
                  {t('cancel')}
                </Button>
              )}
            </VStack>
          </>
        )}
        {/* Covers the form while another date loads, so the editor's WebView stays mounted underneath. */}
        {form && day.state === 'loading' && (
          <Box className="absolute inset-0 bg-canvas">
            <FormSkeleton />
          </Box>
        )}
      </VStack>

      <HStack className="mt-2 items-center justify-between gap-3">
        <Text className="shrink text-[13px] font-semibold uppercase tracking-[0.8px] text-fg-2">
          {t('recentUpdates')}
        </Text>
        <Link onPress={() => router.navigate('/history')}>{t('seeAll')}</Link>
      </HStack>
      {recent.state === 'loading' ? (
        <CardsSkeleton count={1} />
      ) : recent.state === 'error' ? (
        <Notice tone="bad">{t(recent.message)}</Notice>
      ) : recent.data.length ? (
        <Card className="gap-0 py-1">
          {recent.data.map((st, i) => (
            <StatusRow key={st.id} status={st} first={!i} />
          ))}
        </Card>
      ) : (
        <Notice>{t('nothingYet')}</Notice>
      )}
    </Screen>
  )
}

const FormSkeleton = (): React.JSX.Element => (
  <Loading>
    <Skeleton width={140} height={24} />
    <Skeleton width={180} height={18} />
    <Skeleton width="100%" height={300} />
    <Skeleton width="100%" height={48} />
  </Loading>
)
