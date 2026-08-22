'use client'
import { createAvatar } from '@dicebear/core'
import { funEmoji, bottts, shapes, icons, adventurer } from '@dicebear/collection'

/**
 * Item artwork, two tiers:
 *   1. A real image from the web that suits the category (meme templates for
 *      memes, robohash PFPs for NFTs, stock photos for the rest).
 *   2. If that fails to load — venue wifi, a dead host, whatever — an <img>
 *      onError swaps in a locally-generated DiceBear picture, so a broken image
 *      icon never appears.
 *
 * Use the <LotImage> component and you get both tiers for free.
 */

// --- tier 2: local generated art (never fails) ---
const STYLE = { memes: funEmoji, nfts: bottts, games: bottts, cards: shapes, art: shapes, irl: icons, fantasy: adventurer }
const artCache = new Map()

export function artFor(category, seed) {
  const key = `${category || 'x'}:${seed}`
  const hit = artCache.get(key)
  if (hit) return hit
  const style = STYLE[category] || shapes
  const uri = createAvatar(style, {
    seed: String(seed ?? '?'),
    radius: 12,
    backgroundColor: ['efe7ff', 'e2f6e9', 'e3edff', 'ffe6e6', 'ffe9e0', 'fff3d9'],
  }).toDataUri()
  artCache.set(key, uri)
  return uri
}

// --- tier 1: real web images ---
// memegen.link serves blank meme templates at a stable URL; unmapped memes fall
// through to generated art.
const MEME_TEMPLATE = {
  'this is fine': 'fine',
  'distracted boyfriend': 'db',
  'doge': 'doge',
  'stonks': 'stonks',
  'gigachad': 'chad',
  'surprised pikachu': 'pikachu',
  'crying wojak': 'sad-boss',
}

export function webImage(category, name) {
  const slug = encodeURIComponent(String(name ?? 'x').trim().toLowerCase().replace(/\s+/g, '-'))
  if (category === 'memes') {
    const id = MEME_TEMPLATE[String(name ?? '').trim().toLowerCase()]
    return id ? `https://api.memegen.link/images/${id}.png` : null
  }
  if (category === 'nfts') return `https://robohash.org/${slug}.png?set=set1&size=400x400`
  if (category === 'fantasy') return null // use the generated character portrait
  // games / cards / art / irl / fantasy / custom → deterministic stock photo
  return `https://picsum.photos/seed/bidblitz-${slug}/400/400`
}

/** An item's own image, else a web image, else generated art. */
export function imageForItem(item, category) {
  return item?.image || webImage(category ?? item?.category, item?.name) || artFor(category ?? item?.category, item?.name)
}

/**
 * Robust image: tries the web source, falls back to generated art on error, so
 * it never renders broken. `seed`/`category` drive the fallback art.
 */
export function LotImage({ src, name, category, seed, alt = '', style, className }) {
  const initial = src || webImage(category, name) || artFor(category, seed ?? name)
  return (
    <img
      src={initial}
      alt={alt}
      className={className}
      style={style}
      data-seed={seed ?? name ?? ''}
      data-cat={category ?? ''}
      onError={(e) => {
        const fb = artFor(e.currentTarget.dataset.cat, e.currentTarget.dataset.seed)
        if (e.currentTarget.src !== fb) e.currentTarget.src = fb
      }}
    />
  )
}
