'use client'

/**
 * Official Monad brand assets.
 *
 * Path data is taken verbatim from monad.xyz/brand-page-assets/{Logomark,Full}.svg
 * — not redrawn. Three things the mockup got wrong and this fixes:
 *
 *   1. Colour. Monad rebranded; the mark is #6E54FF. The #836EF9 in circulation
 *      (and still on docs.monad.xyz) is the legacy purple.
 *   2. It was a raster PNG. Inline SVG stays crisp on a projector at any size.
 *   3. It was spinning (`om-spin`). The brand guidelines explicitly forbid
 *      rotating, distorting, recolouring, or applying effects to the logo — and
 *      on a projector a rotating logo just reads as a loading spinner.
 *
 * The mark's inner counter is a real hole: the two subpaths wind in opposite
 * directions, so under the default nonzero fill rule the background shows
 * through. Never fill it white — that would show as a patch on the dark screen.
 */

const MONAD_PURPLE = '#6E54FF'

// Logomark.svg — note the art is 181.073 x 183.52, very slightly taller than
// wide. Don't force it square; let preserveAspectRatio do its job.
const LOGOMARK_PATH =
  'M90.5358 0C64.3911 0 0 65.2598 0 91.7593C0 118.259 64.3911 183.52 90.5358 183.52C116.681 183.52 181.073 118.258 181.073 91.7593C181.073 65.2609 116.682 0 90.5358 0ZM76.4273 144.23C65.4024 141.185 35.7608 88.634 38.7655 77.4599C41.7703 66.2854 93.62 36.2439 104.645 39.2892C115.67 42.3341 145.312 94.8846 142.307 106.059C139.302 117.234 87.4522 147.276 76.4273 144.23Z'

// Full.svg — the primary horizontal lockup (mark + wordmark), viewBox 0 0 423 80.
const LOCKUP_MARK =
  'M39.6349 0C28.1892 0 0 28.4481 0 39.9998C0 51.5514 28.1892 80 39.6349 80C51.0805 80 79.2702 51.551 79.2702 39.9998C79.2702 28.4486 51.081 0 39.6349 0ZM33.4584 62.873C28.6319 61.5457 15.6554 38.6374 16.9708 33.7664C18.2863 28.8952 40.985 15.7995 45.8115 17.127C50.6383 18.4543 63.6148 41.3622 62.2994 46.2334C60.9839 51.1046 38.2849 64.2006 33.4584 62.873Z'

const LOCKUP_WORDMARK = [
  'M134.674 48.8653V48.8506L112.153 6.93062C111.71 6.10548 110.484 6.30311 110.318 7.22658L99.1024 69.4849C98.9924 70.095 99.4569 70.6567 100.071 70.6567H108.749C109.225 70.6567 109.633 70.3129 109.718 69.8402L116.249 33.5135L133.805 67.2907C134.174 68.0004 135.181 68.0004 135.55 67.2907L153.105 33.5135L159.637 69.8402C159.722 70.3129 160.13 70.6567 160.606 70.6567H169.283C169.898 70.6567 170.362 70.095 170.252 69.4849L159.037 7.22658C158.87 6.30311 157.645 6.10548 157.202 6.93062L134.674 48.8653Z',
  'M206.74 8.10352C188.875 8.10352 174.882 22.1133 174.882 40.0017C174.882 57.8902 188.875 71.9078 206.74 71.9078C224.557 71.9078 238.516 57.8941 238.516 40.0017C238.516 22.1094 224.557 8.10352 206.74 8.10352ZM206.74 61.227C195.09 61.227 185.963 51.9027 185.963 40.0017C185.963 28.1008 195.09 18.7843 206.74 18.7843C218.343 18.7843 227.435 28.1047 227.435 40.0017C227.435 51.8988 218.342 61.227 206.74 61.227Z',
  'M287.618 47.3188L250.263 6.74143C249.653 6.07969 248.556 6.51471 248.556 7.41797V69.6628C248.556 70.2117 248.997 70.6568 249.541 70.6568H258.572C259.116 70.6568 259.557 70.2117 259.557 69.6628V32.6151L296.829 73.269C297.438 73.9328 298.537 73.4982 298.537 72.594V10.349C298.537 9.80005 298.096 9.35503 297.552 9.35503H288.603C288.059 9.35503 287.618 9.80005 287.618 10.349V47.3188Z',
  'M308.113 70.6564H317.81C318.194 70.6564 318.543 70.431 318.704 70.0791L325.968 54.2025H349.197L356.297 70.0715C356.456 70.4275 356.808 70.6564 357.195 70.6564H367.716C368.442 70.6564 368.919 69.89 368.603 69.23L338.801 6.98899C338.443 6.24032 337.386 6.24032 337.028 6.98899L307.226 69.23C306.91 69.89 307.387 70.6564 308.113 70.6564ZM330.522 44.3519L337.741 28.5412L344.825 44.3519H330.522Z',
  'M392.141 9.35474H377.239C376.695 9.35474 376.254 9.79976 376.254 10.3487V69.6625C376.254 70.2114 376.695 70.6564 377.239 70.6564H392.141C410.615 70.6564 422.095 58.9114 422.095 40.0017C422.095 21.092 410.615 9.35474 392.141 9.35474ZM392.141 60.1393H387.336V19.79H392.141C404.134 19.79 411.013 27.1574 411.013 40.0017C411.013 52.7992 404.134 60.1393 392.141 60.1393Z',
]

/** The Monad mark alone. Sanctioned standalone when "Monad" appears nearby in text. */
export function MonadMark({ size = 40, className = '', style }) {
  return (
    <svg
      height={size}
      viewBox="0 0 181.073 183.52"
      fill="none"
      role="img"
      aria-label="Monad"
      className={className}
      style={{ display: 'block', ...style }}
    >
      <path d={LOGOMARK_PATH} fill={MONAD_PURPLE} />
    </svg>
  )
}

/**
 * The primary horizontal lockup. `inverted` swaps the wordmark to white for
 * dark surfaces — one of the four official colorways. The mark stays purple.
 */
export function MonadLockup({ height = 26, inverted = false, style }) {
  return (
    <svg
      height={height}
      viewBox="0 0 423 80"
      fill="none"
      role="img"
      aria-label="Monad"
      style={{ display: 'block', ...style }}
    >
      <path d={LOCKUP_MARK} fill={MONAD_PURPLE} />
      {LOCKUP_WORDMARK.map((d, i) => (
        <path key={i} d={d} fill={inverted ? '#FFFFFF' : '#000000'} />
      ))}
    </svg>
  )
}

/**
 * BidBlitz brand mark — the speed-lines "B". This is the actual brand asset
 * (public/brand/bidblitz-mark.png), keyed to transparency from the source art,
 * not a redraw. Distinct from the Monad diamond (which now only marks "Built on
 * Monad"). Native art is 367×263, so height drives size and width follows.
 */
const BB = '#6b2de6'
export function BidBlitzMark({ size = 40, style, className }) {
  return (
    <img
      src="/brand/bidblitz-mark.png"
      alt="BidBlitz"
      height={size}
      style={{ display: 'block', height: size, width: 'auto', ...style }}
      className={className}
    />
  )
}

/** Our own wordmark — the BidBlitz identity, distinct from Monad's. */
export function BidBlitzLogo({ size = 30, mark = true, markSize }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 11 }}>
      {mark && <BidBlitzMark size={markSize ?? size * 1.05} />}
      <span
        className="display"
        style={{ fontWeight: 800, fontSize: size, letterSpacing: '-0.02em', textTransform: 'none' }}
      >
        Bid<span style={{ color: 'var(--monad-purple)' }}>Blitz</span>
      </span>
    </span>
  )
}

/** Clean line/solid icons for the landing cards — replaces the emoji. */
export function GavelIcon({ size = 30, color = BB }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m14 13-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10" />
      <path d="m16 16 6-6" /><path d="m8 8 6-6" />
      <path d="m9 7 8 8" /><path d="m21 11-8-8" />
      <path d="M3 21h9" />
    </svg>
  )
}
export function TrophyIcon({ size = 30, color = BB }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}
export function ControllerIcon({ size = 30, color = BB }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="11" x2="10" y2="11" /><line x1="8" y1="9" x2="8" y2="13" />
      <line x1="15" y1="12" x2="15.01" y2="12" /><line x1="18" y1="10" x2="18.01" y2="10" />
      <rect width="20" height="12" x="2" y="6" rx="6" />
    </svg>
  )
}

export function Bolt({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 10 14" fill="none" aria-hidden="true">
      <path d="M6 0 0 8h3.2L4 14l6-8H6.8L6 0Z" fill={color} />
    </svg>
  )
}
