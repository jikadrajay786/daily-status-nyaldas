import type { CommentTarget } from '@daily-status/core/commentService'
import { createContext, use } from 'react'

// Opens the details dialog (full content plus comments); provided once by the signed-in workspace.
export const DetailsContext = createContext<(t: CommentTarget) => void>(() => {})
export const useOpenDetails = (): ((t: CommentTarget) => void) => use(DetailsContext)
