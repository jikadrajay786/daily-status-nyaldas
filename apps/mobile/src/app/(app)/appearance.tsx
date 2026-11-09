import { AppearanceSettings } from '@/components/AppearanceSettings'
import { Screen } from '@/components/ui'

export default function Appearance(): React.JSX.Element {
  return (
    <Screen underHeader>
      <AppearanceSettings />
    </Screen>
  )
}
