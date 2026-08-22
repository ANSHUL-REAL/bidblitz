import { MODE } from './modes.mjs'

/**
 * Auction categories — the themes a host can pick when creating a room.
 *
 * A category is mostly a frontend concept: it seeds the item picker with
 * relevant presets, gives the card a face, and (for Fantasy League only) flips
 * the room to SQUADS — teams share a purse. Every other category is SOLO:
 * everyone bids for themselves.
 *
 * `tint` is the soft gradient behind the emoji on the category card.
 * A host can pick several, and can also name their own (see makeCustomCat).
 */
export const CATEGORIES = [
  {
    id: 'memes',
    emoji: '😂',
    label: 'Memes',
    mode: MODE.SOLO,
    blurb: 'Funny, viral, and internet culture',
    tint: 'linear-gradient(160deg,#efe7ff,#d9c9ff)',
    items: [
      { name: 'This Is Fine', image: '/lots/thisisfine.jpg' },
      { name: 'Distracted Boyfriend', image: '/lots/distracted.jpg' },
      { name: 'Doge', image: '' },
      { name: 'Stonks', image: '' },
      { name: 'Gigachad', image: '' },
      { name: 'Surprised Pikachu', image: '' },
      { name: 'Crying Wojak', image: '' },
    ],
  },
  {
    id: 'nfts',
    emoji: '🖼️',
    label: 'NFTs',
    mode: MODE.SOLO,
    blurb: 'Digital art and collectibles',
    tint: 'linear-gradient(160deg,#e2f6e9,#c2ead2)',
    items: [
      { name: 'Bored Ape #1234', image: '' },
      { name: 'Mutant Ape', image: '' },
      { name: 'Monkey Kingdom', image: '' },
      { name: 'Azuki', image: '' },
      { name: 'Pudgy Penguin', image: '' },
    ],
  },
  {
    id: 'games',
    emoji: '🎮',
    label: 'Games',
    mode: MODE.SOLO,
    blurb: 'Gaming, eSports and more',
    tint: 'linear-gradient(160deg,#e3edff,#c4d8fb)',
    items: [
      { name: 'Valorant', image: '' },
      { name: 'CS2', image: '' },
      { name: 'League of Legends', image: '' },
      { name: 'Fortnite', image: '' },
      { name: 'Minecraft', image: '' },
    ],
  },
  {
    id: 'cards',
    emoji: '🃏',
    label: 'Cards & Collectibles',
    mode: MODE.SOLO,
    blurb: 'Trading cards and collectibles',
    tint: 'linear-gradient(160deg,#ffe6e6,#ffc9cf)',
    items: [
      { name: 'Holo Charizard', image: '' },
      { name: 'Rookie Card', image: '' },
      { name: 'Rare Foil', image: '' },
    ],
  },
  {
    id: 'art',
    emoji: '🎨',
    label: 'Art',
    mode: MODE.SOLO,
    blurb: 'Paintings, prints and creative work',
    tint: 'linear-gradient(160deg,#ffe9e0,#ffd0c0)',
    items: [
      { name: 'Generative Piece #7', image: '' },
      { name: 'Original 1/1', image: '' },
      { name: 'Pixel Study', image: '' },
    ],
  },
  {
    id: 'irl',
    emoji: '📦',
    label: 'IRL Items',
    mode: MODE.SOLO,
    blurb: 'Real things in the room',
    tint: 'linear-gradient(160deg,#fff3d9,#ffe3ab)',
    items: [
      { name: 'Event Hoodie', image: '' },
      { name: 'Mechanical Keyboard', image: '' },
      { name: 'Sticker Pack', image: '' },
    ],
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

/** Host-defined categories carry their name inline: "custom:Sneakers". */
export const isCustomCat = (id) => typeof id === 'string' && id.startsWith('custom:')
export const makeCustomCat = (name) => `custom:${String(name).trim().slice(0, 24)}`
export const catLabel = (id) => (isCustomCat(id) ? id.slice(7) : categoryById(id)?.label ?? id)
export const catEmoji = (id) => (isCustomCat(id) ? '✨' : categoryById(id)?.emoji ?? '•')

/** Fantasy League is its own mode (team draft), kept out of the mixable
 * categories on purpose. These are its default draftable players. */
export const FANTASY_ITEMS = [
  { name: 'Virat Kohli', image: '' },
  { name: 'Rohit Sharma', image: '' },
  { name: 'MS Dhoni', image: '' },
  { name: 'Jasprit Bumrah', image: '' },
  { name: 'Hardik Pandya', image: '' },
  { name: 'Ravindra Jadeja', image: '' },
  { name: 'KL Rahul', image: '' },
  { name: 'Suryakumar Yadav', image: '' },
  { name: 'Shubman Gill', image: '' },
  { name: 'Rishabh Pant', image: '' },
  { name: 'Sanju Samson', image: '' },
  { name: 'Yashasvi Jaiswal', image: '' },
  { name: 'Ruturaj Gaikwad', image: '' },
  { name: 'Axar Patel', image: '' },
  { name: 'Mohammed Shami', image: '' },
  { name: 'David Warner', image: '' },
  { name: 'Rashid Khan', image: '' },
  { name: 'Andre Russell', image: '' },
  { name: 'Jos Buttler', image: '' },
  { name: 'Glenn Maxwell', image: '' },
]
