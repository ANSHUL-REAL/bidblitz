/**
 * One-tap presets for /admin, so you are not typing during your first minute
 * on stage. Lots are created live on-chain, so this list is a convenience —
 * not a fixed roster. Anything the room shouts can be typed in.
 *
 * Images live in /public/lots/. Bundled at build time on purpose: venue wifi
 * cannot break an image that ships with the page.
 */
export const PRESET_LOTS = [
  // Auction presets are memes / in-jokes only. Cricket players live in the
  // separate Fantasy League mode (FANTASY_ITEMS), never mixed in here.
  { name: 'The Guy Who Deployed To Mainnet', image: '/lots/mainnet.jpg', kind: 'injoke' },
  { name: 'Whoever Broke The Venue WiFi', image: '/lots/wifi.jpg', kind: 'injoke' },
  { name: 'Last Minute Git Push', image: '/lots/gitpush.jpg', kind: 'injoke' },
  { name: 'This Is Fine', image: '/lots/thisisfine.jpg', kind: 'meme' },
  { name: 'Distracted Boyfriend', image: '/lots/distracted.jpg', kind: 'meme' },
]

/** Images offered as one-tap choices in /admin for improvised lots. */
export const IMAGE_LIBRARY = [
  '/lots/thisisfine.jpg',
  '/lots/distracted.jpg',
  '/lots/mainnet.jpg',
  '/lots/wifi.jpg',
  '/lots/gitpush.jpg',
  '/lots/generic-1.jpg',
  '/lots/generic-2.jpg',
  '/lots/generic-3.jpg',
]

export const DEFAULT_DURATION = 20

/**
 * A raw double-quote in a lot name would break the JSON data-URI that tokenURI
 * builds on-chain. Strip it here, at the only place names are authored.
 */
export const sanitizeLotName = (s) =>
  (s ?? '').replace(/["\\\n\r]/g, '').trim().slice(0, 60)
