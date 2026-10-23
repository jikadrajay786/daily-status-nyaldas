import { sanitize } from '@daily-status/editor/sanitize'

export const RichText = ({ html }: { html: string }): React.JSX.Element => (
  <div className="rich text-sm text-fg" dangerouslySetInnerHTML={{ __html: sanitize(html) }} />
)
