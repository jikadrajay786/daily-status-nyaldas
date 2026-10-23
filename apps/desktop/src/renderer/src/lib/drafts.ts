import { parseDraft, type Draft } from '@daily-status/core/richText'

// localStorage is user-writable and may hold an older shape, so parseDraft checks it.
export const loadDraft = (key: string): Draft | null => parseDraft(localStorage.getItem(key))

export const saveDraft = (key: string, d: Draft | null): void =>
  d ? localStorage.setItem(key, JSON.stringify(d)) : localStorage.removeItem(key)
