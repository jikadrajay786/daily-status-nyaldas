import { useEffect } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'

// iOS ignores live regions, so messages that must be heard are announced explicitly there.
export const useAnnounce = (message: string | undefined): void =>
  useEffect(() => {
    if (message && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message)
  }, [message])
