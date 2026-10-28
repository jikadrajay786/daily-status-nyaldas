import type { CommentTarget } from '@daily-status/core/commentService'
import { createContext, use } from 'react'

export type QuickTarget = CommentTarget & { title: string }

// Opens the long-press comment sheet; provided once in the signed-in layout.
export const QuickCommentContext = createContext<(t: QuickTarget) => void>(() => {})
export const useQuickComment = (): ((t: QuickTarget) => void) => use(QuickCommentContext)

export const detailsHref = ({ kind, id }: CommentTarget) =>
  ({ pathname: '/details/[kind]/[id]', params: { kind, id } }) as const
