// The app mark (brand/logo.svg) drawn with theme tokens. `inverse` swaps it for use on an accent background.
export const Logo = ({
  size = 56,
  inverse = false
}: {
  size?: number
  inverse?: boolean
}): React.JSX.Element => {
  const [base, page] = inverse
    ? ['fill-on-accent', 'fill-accent']
    : ['fill-accent', 'fill-on-accent']
  const ink = inverse ? 'stroke-on-accent' : 'stroke-accent'
  return (
    <svg aria-hidden viewBox="0 0 512 512" width={size} height={size} className="shrink-0">
      <rect width="512" height="512" rx="116" className={base} />
      <rect x="128" y="146" width="256" height="238" rx="40" className={page} />
      <path
        d="M128 186a40 40 0 0 1 40-40h176a40 40 0 0 1 40 40v30H128z"
        className={`${base} opacity-30`}
      />
      {[181, 301].map((x) => (
        <rect
          key={x}
          x={x}
          y="112"
          width="30"
          height="70"
          rx="15"
          strokeWidth="12"
          className={`${page} ${ink}`}
        />
      ))}
      <path
        d="M196 296l42 42 80-86"
        fill="none"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={ink}
      />
    </svg>
  )
}
