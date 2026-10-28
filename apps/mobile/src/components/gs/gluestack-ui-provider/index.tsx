import { View, ViewProps } from 'react-native'
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator'
import { ToastProvider } from '@gluestack-ui/core/toast/creator'

// No theme handling here: the root layout gives Uniwind the saved theme, and a second owner would fight it.
export function GluestackUIProvider({
  children,
  style
}: {
  children?: React.ReactNode
  style?: ViewProps['style']
}): React.JSX.Element {
  return (
    <View style={[{ flex: 1, height: '100%', width: '100%' }, style]}>
      <OverlayProvider>
        <ToastProvider>{children}</ToastProvider>
      </OverlayProvider>
    </View>
  )
}
