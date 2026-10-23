import { useState } from 'react'

// Pull-to-refresh spinner that stays up until the reload it started has finished (useQuery's reload has no promise).
export const usePullToRefresh = (
  loading: boolean,
  reload: () => void
): { refreshing: boolean; onRefresh: () => void } => {
  const [pulling, setPulling] = useState(false)
  if (pulling && !loading) setPulling(false)
  return {
    refreshing: pulling,
    onRefresh: () => {
      setPulling(true)
      reload()
    }
  }
}
