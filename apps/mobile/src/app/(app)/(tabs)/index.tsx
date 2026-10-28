import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import type { DailyStatus } from '@daily-status/core/database.types'
import { fmtDate } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { loadPlanBefore, parseDraft, type Draft } from '@daily-status/core/richText'
import {
  canChange,
  getMyStatus,
  listMyStatuses,
  saveStatus
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
import { CardsSkeleton, StatusCard } from '@/components/StatusCard'
import { Badge, Button, Link, Loading, Notice, Screen, Skeleton, Title } from '@/components/ui'
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
  // `edit=1` opens the date's saved update straight in the form (History and Recent's Edit buttons).
  const editing = params.edit === '1'
  const [saved, setSaved] = useState<string | null>(null)
  const setDate = (d: string, edit = false): void => {
    setSaved(null)
    router.setParams({ date: d, edit: edit ? '1' : '' })
  }

  const [row, , rowRefreshing] = useLiveQuery(`mine:${profile.id}:${date}`, () =>
    getMyStatus(profile.id, date)
  )
  const [recent, , recentRefreshing] = useLiveQuery(`recent:${profile.id}`, () =>
    listMyStatuses(profile.id, '', 5)
  )
  const [resets, setResets] = useState(0)
  const pull = usePullToRefresh(
    row.state === 'loading' || recent.state === 'loading' || rowRefreshing || recentRefreshing,
    bumpLive
  )
  const draftKey = `draft:${profile.id}:${date}`

  // A new date, a save or "Start over" resets the form, but the editor's WebView stays mounted: only its document
  // is swapped (docKey), which is much faster than reloading the page.
  const [form, setForm] = useState<Form | null>(null)
  const [save, setSave] = useState<Save>({ state: 'idle' })
  const [hoursErr, setHoursErr] = useState<string>()
  const writeLang = useWriteLang(lang)
  const key = row.state === 'ok' ? `${date}:${row.data?.updated_at ?? 'new'}:${resets}` : null
  if (row.state === 'ok' && key && form?.key !== key) {
    const draft = parseDraft(prefs.get(draftKey))
    setForm({
      key,
      row: row.data,
      draft,
      hours: draft?.hours ?? String(row.data?.hours_logged ?? 8)
    })
    setSave({ state: 'idle' })
    setHoursErr(undefined)
  }

  const hoursNow = useRef('')
  useEffect(() => {
    hoursNow.current = form?.hours ?? ''
  }, [form?.hours])
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const savedHours = String(form?.row?.hours_logged ?? 8)
  const { off: dayOff, holiday } = useDayOff(date)
  const locked = !!form?.row && !canChange(date, profile.role)
  // Once submitted the form closes and empties; Edit reopens it filled with what was saved. An unsaved draft
  // means someone was mid-edit when they left, so the form stays open with their words.
  const closed = locked || (!!form?.row && !editing && !form.draft)
  const writeDraft = (html: string, hours: string): void =>
    prefs.set(draftKey, JSON.stringify({ html, hours } satisfies Draft))
  // Drafts are written on a short debounce: the OS can close the app at any moment.
  const { editor, content, onChange, flush } = useEditorContent((c) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => writeDraft(c.html, hoursNow.current), 300)
  })

  const setHours = (h: string): void => {
    if (!form) return
    setForm({ ...form, hours: h })
    setHoursErr(undefined)
    if (content.current.edited || h !== savedHours) writeDraft(content.current.html, h)
  }

  const scroll = useRef<ScrollViewInstance>(null)
  const formY = useRef(0)
  const editorY = useRef(0)
  const fit = useEditorFit(scroll, () => formY.current + editorY.current)
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
    try {
      clearTimeout(timer.current)
      await saveStatus(profile.id, {
        date,
        description: c.html,
        hours_logged: parseHours(form.hours)
      })
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
    <Screen scrollRef={scroll} refreshControl={<RefreshControl {...pull} />}>
      <Title>{t('navToday')}</Title>
      <VStack onLayout={(e) => (formY.current = e.nativeEvent.layout.y)} className="gap-3.5">
        <DateField value={date} onChange={setDate} hideLabel />
        {form && !form.row && dayOff && (
          <Notice>{holiday ? t('holidayToday', { name: holiday }) : t('dayOff')}</Notice>
        )}
        {row.state === 'error' ? (
          <Notice tone="bad">{t(row.message)}</Notice>
        ) : !form ? (
          <FormSkeleton />
        ) : (
          <>
            {locked && form.row && (
              <>
                <Notice>{t('statusLocked')}</Notice>
                <StatusCard status={form.row} />
              </>
            )}
            {closed && !locked && form.row && (
              <>
                {saved === date && (
                  <Notice tone="ok">{t('savedDone', { date: fmtDate(date, locale) })}</Notice>
                )}
                <StatusCard
                  status={form.row}
                  actions={
                    <Button variant="ghost" onPress={() => setDate(date, true)}>
                      {t('edit')}
                    </Button>
                  }
                />
              </>
            )}
            {/* Locked dates collapse the form instead of removing it: unmounting (or display:none, which Fabric
                also detaches) tears down the editor's WebView while its calls are in flight. */}
            <VStack
              className={`gap-3.5 ${closed ? 'h-0 overflow-hidden opacity-0' : ''}`}
              pointerEvents={closed ? 'none' : 'auto'}
              accessibilityElementsHidden={closed}
              importantForAccessibility={closed ? 'no-hide-descendants' : 'auto'}
            >
              <HStack className="flex-wrap items-center gap-2">
                <Badge
                  label={
                    form.row
                      ? t('submittedAt', {
                          when: new Date(form.row.updated_at).toLocaleString(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })
                        })
                      : t('notSubmitted')
                  }
                  tone={form.row ? 'ok' : 'warn'}
                />
                {form.draft && (
                  <>
                    <Badge label={t('draftKept')} tone="info" />
                    <Link onPress={discard}>{t('startOver')}</Link>
                  </>
                )}
              </HStack>
              <Text accessibilityRole="header" className="mt-1 text-[16px] font-semibold text-fg">
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
                  // At rest a drag on the editor scrolls the screen; only while typing does it scroll the writing area.
                  dom={{
                    nestedScrollEnabled: fit.typing,
                    scrollEnabled: fit.typing,
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
              />
              {save.state === 'error' && <Notice tone="bad">{t(save.message)}</Notice>}
              <Button onPress={submit} busy={save.state === 'saving'}>
                {t(form.row ? 'saveChanges' : 'submit')}
              </Button>
              {form.row && (
                <Button variant="ghost" onPress={cancelEdit} disabled={save.state === 'saving'}>
                  {t('cancel')}
                </Button>
              )}
            </VStack>
          </>
        )}
        {/* Covers the form while another date loads, so the editor's WebView stays mounted underneath. */}
        {form && row.state === 'loading' && (
          <Box className="absolute inset-0 bg-canvas">
            <FormSkeleton />
          </Box>
        )}
      </VStack>

      <Text className="mt-4 text-[13px] font-semibold uppercase tracking-[0.8px] text-fg-2">
        {t('recentUpdates')}
      </Text>
      {recent.state === 'loading' ? (
        <CardsSkeleton count={2} />
      ) : recent.state === 'error' ? (
        <Notice tone="bad">{t(recent.message)}</Notice>
      ) : recent.data.length ? (
        recent.data.map((st) => (
          <StatusCard
            key={st.id}
            status={st}
            actions={
              // The selected date's card above has its own Edit.
              st.date !== date &&
              canChange(st.date, profile.role) && (
                <Button variant="ghost" onPress={() => setDate(st.date, true)}>
                  {t('edit')}
                </Button>
              )
            }
          />
        ))
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
    <Skeleton width="100%" height={360} />
    <Skeleton width="100%" height={48} />
    <Skeleton width="100%" height={48} />
  </Loading>
)
