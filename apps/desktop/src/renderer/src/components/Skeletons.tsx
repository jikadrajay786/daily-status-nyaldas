import { Card, Loading, Skeleton } from './ui'

// Each skeleton mirrors the layout it stands in for, so nothing jumps when the data arrives.

const Lines = ({ widths }: { widths: readonly string[] }): React.JSX.Element => (
  <div className="flex flex-col gap-2">
    {widths.map((w, i) => (
      <Skeleton key={i} className={`h-3.5 ${w}`} />
    ))}
  </div>
)

const CardShape = ({ author }: { author: boolean }): React.JSX.Element => (
  <div className="rounded-xl border border-line bg-card p-4">
    <div className="mb-4 flex items-center gap-3">
      {author && (
        <div className="mr-auto flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-44" />
        </div>
      )}
      <Skeleton className={`h-4 w-28 ${author ? '' : 'mr-auto'}`} />
      <Skeleton className="h-5 w-10 rounded-full" />
    </div>
    <Lines widths={['w-1/3', 'w-3/4', 'w-2/3', 'w-1/2']} />
  </div>
)

export const CardsSkeleton = ({
  count = 3,
  author = false
}: {
  count?: number
  author?: boolean
}): React.JSX.Element => (
  <Loading className="flex flex-col gap-3">
    {Array.from({ length: count }, (_, i) => (
      <CardShape key={i} author={author} />
    ))}
  </Loading>
)

export const PeopleSkeleton = ({
  count = 5,
  avatar = true
}: {
  count?: number
  avatar?: boolean
}): React.JSX.Element => (
  <Loading className="flex flex-col gap-4">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Skeleton className={avatar ? 'size-9 rounded-full' : 'size-2 rounded-full'} />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </div>
    ))}
  </Loading>
)

export const FormSkeleton = (): React.JSX.Element => (
  <Loading className="flex flex-col gap-5">
    <Skeleton className="h-5 w-32 rounded-full" />
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-4 w-40" />
      <div className="rounded-lg border border-line">
        <Skeleton className="h-10 rounded-none rounded-t-lg" />
        <div className="p-3">
          <Lines widths={['w-1/2', 'w-3/4', 'w-2/3']} />
        </div>
        <div className="h-28" />
      </div>
    </div>
    <div className="flex w-48 flex-col gap-1.5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9" />
    </div>
    <Skeleton className="h-9 w-24" />
  </Loading>
)

export const CalendarSkeleton = (): React.JSX.Element => (
  <Loading>
    <Skeleton className="mb-3 h-4 w-28" />
    <div className="grid max-w-80 grid-cols-7 gap-x-2 gap-y-3">
      {Array.from({ length: 35 }, (_, i) => (
        <Skeleton key={i} className="mx-auto size-6 rounded-full" />
      ))}
    </div>
  </Loading>
)

// Before the session is known: the outline of the app, so signing in doesn't flash a blank screen.
export const AppSkeleton = (): React.JSX.Element => (
  <Loading className="flex h-screen bg-canvas">
    <div className="flex w-60 max-w-[30vw] shrink-0 flex-col gap-3 border-r border-line bg-panel p-4">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-4 w-24" />
      </div>
      {['w-28', 'w-24', 'w-32', 'w-24'].map((w, i) => (
        <Skeleton key={i} className={`ml-3 h-4 ${w}`} />
      ))}
    </div>
    <div className="mx-auto w-full max-w-5xl flex-1 p-8">
      <Skeleton className="mb-2 h-6 w-40" />
      <Skeleton className="mb-8 h-4 w-72" />
      <Card>
        <Lines widths={['w-32', 'w-1/2', 'w-3/4', 'w-2/3', 'w-1/3']} />
        <div className="h-40" />
      </Card>
    </div>
  </Loading>
)
