'use client'
import { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import { adventurer } from '@dicebear/collection'

/**
 * The same DiceBear "adventurer" face used on the hero race track, so a given
 * person shows the identical avatar everywhere — race track, standings, the
 * leading line, the bidder header. Seed by a stable id (address or bidder id)
 * and the face is deterministic.
 *
 * Generated from the npm package, not api.dicebear.com — no network call, so
 * venue wifi can never blank out someone's face.
 */
/**
 * A small, fixed palette of avatar seeds people pick from when they join. Names
 * (not addresses) so the choices look intentional; the resulting face is still
 * deterministic per seed and drawn locally, so it renders identically on every
 * phone and on the big screen.
 */
export const AVATAR_SEEDS = [
  'Comet', 'Rocket', 'Tiger', 'Panda', 'Ninja', 'Ace',
  'Volt', 'Maverick', 'Pixel', 'Turbo', 'Nova', 'Ghost',
]

export function avatarDataUri(seed) {
  return createAvatar(adventurer, {
    seed: String(seed ?? '?'),
    radius: 50,
    backgroundColor: ['ffd5dc', 'c0aede', 'd1d4f9', 'ffdfbf', 'b6e3f4'],
  }).toDataUri()
}

export function Avatar({ seed, size = 36, ring = null, style }) {
  const uri = useMemo(() => avatarDataUri(seed), [seed])
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        boxShadow: 'inset 0 -6px 12px rgba(0,0,0,.07)',
        border: ring ? `2px solid ${ring}` : 'none',
        ...style,
      }}
    >
      <img src={uri} alt="" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
    </div>
  )
}
