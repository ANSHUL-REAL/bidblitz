'use client'
import { createAvatar } from '@dicebear/core'
import { funEmoji, bottts, shapes, icons, adventurer } from '@dicebear/collection'

/**
 * Locally-generated artwork for preset items, so memes/NFTs/etc. show a picture
 * instead of bare text — with zero network calls (DiceBear runs in-browser), so
 * nothing 404s and venue wifi can't blank it. Each category maps to a DiceBear
 * style that suits it (funEmoji for memes, bottts for NFT-style PFPs, …).
 *
 * Cached per (category, seed) so repeated renders don't regenerate the SVG.
 */
const STYLE = {
  memes: funEmoji,
  nfts: bottts,
  games: bottts,
  cards: shapes,
  art: shapes,
  irl: icons,
  fantasy: adventurer,
}

const cache = new Map()

export function artFor(category, seed) {
  const key = `${category || 'x'}:${seed}`
  const hit = cache.get(key)
  if (hit) return hit
  const style = STYLE[category] || shapes
  const uri = createAvatar(style, {
    seed: String(seed ?? '?'),
    radius: 12,
    backgroundColor: ['efe7ff', 'e2f6e9', 'e3edff', 'ffe6e6', 'ffe9e0', 'fff3d9'],
  }).toDataUri()
  cache.set(key, uri)
  return uri
}

/** An item's own image if it has one, otherwise generated art for its category. */
export const imageForItem = (item, category) => item?.image || artFor(category ?? item?.category, item?.name)
