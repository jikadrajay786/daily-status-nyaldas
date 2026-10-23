// Classic blocking script: runs before first paint so a saved theme never flashes the default one.
// Mirrors the "appearance" key in src/lib/appearance.ts; unknown values simply match no CSS selector.
try {
  const saved = JSON.parse(localStorage.getItem('appearance') || '{}')
  for (const k of ['theme', 'font', 'size', 'density', 'contrast'])
    if (typeof saved[k] === 'string') document.documentElement.dataset[k] = saved[k]
} catch {
  // Corrupt value: keep the defaults declared on <html>.
}
