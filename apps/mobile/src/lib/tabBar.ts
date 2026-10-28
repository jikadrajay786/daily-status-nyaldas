import { createContext, useContext } from 'react'

// Pill height: the 48pt tap target plus 6pt padding above and below (h-12, p-1.5 in LiquidTabBar).
export const PILL = 60
export const bottomPad = (inset: number): number => Math.max(inset, 12) + 4

// The bar floats over the screens, so tab screens pad their scroll content by this much to clear it.
export const TabBarInset = createContext(0)
export const useTabBarInset = (): number => useContext(TabBarInset)
