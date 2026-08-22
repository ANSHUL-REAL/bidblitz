'use client'
import { useLayoutEffect, useRef } from 'react'

/**
 * FLIP-animated ordered list. When the sort order changes — someone outbids and
 * crosses someone else — the rows physically slide to their new slots instead of
 * snapping, and the row that climbed gets a short pulse. That motion is what
 * makes the standings feel like a real race rather than a table redraw.
 *
 * FLIP = First/Last/Invert/Play: remember each row's old position, let React
 * reorder the DOM, then transform each row from its old spot back to zero and
 * animate the transform away.
 */
export function Leaderboard({ items, getKey, renderRow, gap = 6, dark = false }) {
  const containerRef = useRef(null)
  const prev = useRef(new Map())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const seen = new Set()
    for (const node of container.children) {
      const key = node.dataset.key
      seen.add(key)
      // offsetTop is the laid-out position ignoring transforms, so a re-render
      // mid-slide doesn't re-measure the moving element and restart the anim.
      const top = node.offsetTop
      const old = prev.current.get(key)

      if (old != null) {
        const dy = old - top
        if (Math.abs(dy) > 1) {
          // Invert: jump the node back to where it was, with no transition…
          node.style.transition = 'none'
          node.style.transform = `translateY(${dy}px)`
          node.getBoundingClientRect() // force reflow so the jump takes effect
          // …then Play: release to its real slot.
          requestAnimationFrame(() => {
            node.style.transition = 'transform .55s cubic-bezier(.2,.85,.25,1)'
            node.style.transform = ''
          })
          // A climb (moved up) gets a pulse so the overtake reads.
          if (dy > 1) {
            node.animate(
              [
                { boxShadow: `0 0 0 0 ${dark ? 'rgba(131,110,249,.55)' : 'rgba(107,45,230,.45)'}` },
                { boxShadow: `0 0 0 6px rgba(107,45,230,0)` },
              ],
              { duration: 650, easing: 'ease-out' },
            )
          }
        }
      }
      prev.current.set(key, top)
    }
    // forget rows that left
    for (const key of [...prev.current.keys()]) if (!seen.has(key)) prev.current.delete(key)
  })

  return (
    <div ref={containerRef} style={{ display: 'grid', gap }}>
      {items.map((it) => {
        const key = getKey(it)
        return (
          <div key={key} data-key={key} style={{ borderRadius: 12 }}>
            {renderRow(it)}
          </div>
        )
      })}
    </div>
  )
}
