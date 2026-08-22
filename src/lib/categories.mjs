import { MODE } from './modes.mjs'

/**
 * Auction categories — the themes a host can pick when creating a room.
 *
 * A category is mostly a frontend concept: it seeds the item picker with
 * relevant presets and gives the room a face. The one category that changes the
 * on-chain mechanic is Fantasy League, which runs as SQUADS (teams share a
 * purse); every other category runs as SOLO (everyone bids for themselves).
 *
 * A host can pick several — a room can auction memes AND NFTs. Custom is the
 * blank slate: no presets, you type everything.
 */
export const CATEGORIES = [
  {
    id: 'memes',
    emoji: '😂',
    label: 'Memes',
    mode: MODE.SOLO,
    blurb: 'Meme templates, in-jokes, cursed images',
    items: [
      { name: 'This Is Fine', image: '/lots/thisisfine.jpg' },
      { name: 'Distracted Boyfriend', image: '/lots/distracted.jpg' },
      { name: 'Last-Minute Git Push', image: '/lots/gitpush.jpg' },
      { name: 'Whoever Broke The WiFi', image: '/lots/wifi.jpg' },
    ],
  },
  {
    id: 'nfts',
    emoji: '🖼️',
    label: 'NFTs',
    mode: MODE.SOLO,
    blurb: 'PFPs, 1/1s, whole collections',
    items: [
      { name: 'Genesis PFP #1', image: '/lots/generic-1.jpg' },
      { name: 'Rare 1/1 Drop', image: '/lots/generic-2.jpg' },
      { name: 'Floor Sweeper', image: '/lots/generic-3.jpg' },
    ],
  },
  {
    id: 'fantasy',
    emoji: '🏏',
    label: 'Fantasy League',
    mode: MODE.SQUADS,
    blurb: 'Draft players onto four teams, IPL-style',
    items: [
      { name: 'Virat Kohli', image: '/lots/kohli.jpg' },
      { name: 'Jasprit Bumrah', image: '/lots/bumrah.jpg' },
      { name: 'Smriti Mandhana', image: '/lots/mandhana.jpg' },
    ],
  },
  {
    id: 'cards',
    emoji: '🃏',
    label: 'Cards & Collectibles',
    mode: MODE.SOLO,
    blurb: 'TCG cards, rare collectibles, sneakers',
    items: [
      { name: 'Holo Charizard', image: '/lots/generic-1.jpg' },
      { name: 'Rookie Card', image: '/lots/generic-2.jpg' },
    ],
  },
  {
    id: 'art',
    emoji: '🎨',
    label: 'Art',
    mode: MODE.SOLO,
    blurb: 'Generative pieces and 1/1 originals',
    items: [
      { name: 'Generative Piece #7', image: '/lots/generic-3.jpg' },
      { name: 'Original 1/1', image: '/lots/generic-1.jpg' },
    ],
  },
  {
    id: 'irl',
    emoji: '📦',
    label: 'IRL Items',
    mode: MODE.SOLO,
    blurb: 'Real things in the room — swag, gadgets, snacks',
    items: [
      { name: 'Event Hoodie', image: '/lots/generic-2.jpg' },
      { name: 'Mechanical Keyboard', image: '/lots/generic-3.jpg' },
    ],
  },
  {
    id: 'awards',
    emoji: '🔥',
    label: 'Roast & Awards',
    mode: MODE.SOLO,
    blurb: 'Auction the people in the room',
    items: [
      { name: 'The Guy Who Deployed To Mainnet', image: '/lots/mainnet.jpg' },
      { name: 'Most Aggressive Bidder', image: '' },
    ],
  },
  {
    id: 'custom',
    emoji: '✏️',
    label: 'Custom',
    mode: MODE.SOLO,
    blurb: 'Blank slate — you type every item yourself',
    items: [],
  },
]

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id)

/** A room is SQUADS if any chosen category is the fantasy one, else SOLO. */
export function modeForCategories(ids = []) {
  return ids.some((id) => categoryById(id)?.mode === MODE.SQUADS) ? MODE.SQUADS : MODE.SOLO
}

/** Combined preset items for the chosen categories (deduped by name). */
export function itemsForCategories(ids = []) {
  const seen = new Set()
  const out = []
  for (const id of ids) {
    for (const it of categoryById(id)?.items ?? []) {
      const key = it.name.toLowerCase()
      if (!seen.has(key)) { seen.add(key); out.push({ ...it, category: id }) }
    }
  }
  return out
}
