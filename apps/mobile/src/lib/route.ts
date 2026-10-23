// Route params arrive from links too, so ids are checked before they reach a query.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const uuidParam = (v: string | string[] | undefined): string | null =>
  typeof v === 'string' && UUID.test(v) ? v : null
