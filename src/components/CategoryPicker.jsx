'use client'
import { useState } from 'react'
import { CATEGORIES, isCustomCat, makeCustomCat, catLabel, modeForCategories } from '../lib/categories.mjs'

/**
 * Horizontal, scrollable category cards — the auction's theme picker.
 * Multi-select; a check badge marks chosen cards. Fantasy League shows a
 * "Team draft" note because it changes the mechanic. Hosts can also name their
 * own category, which appears as an extra selected card.
 */
export function CategoryPicker({ value, onChange }) {
  const [custom, setCustom] = useState('')
  const has = (id) => value.includes(id)
  const toggle = (id) => onChange(has(id) ? value.filter((x) => x !== id) : [...value, id])
  const addCustom = () => {
    const name = custom.trim()
    if (!name) return
    const id = makeCustomCat(name)
    if (!value.includes(id)) onChange([...value, id])
    setCustom('')
  }

  const customIds = value.filter(isCustomCat)
  const teamDraft = modeForCategories(value) === 1

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: '.16em', color: '#6b6d78' }}>
          CATEGORIES
        </span>
        {teamDraft && (
          <span style={{ fontSize: 12, color: '#6b2de6', fontWeight: 700 }}>Team draft ⓘ</span>
        )}
      </div>

      {/* scrollable card row */}
      <div
        className="cat-scroll"
        style={{ display: 'flex', gap: 12, marginTop: 12, overflowX: 'auto', paddingBottom: 12, scrollSnapType: 'x proximity' }}
      >
        {CATEGORIES.map((c) => {
          const on = has(c.id)
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => toggle(c.id)}
              className="btn-plain"
              style={{
                flex: '0 0 auto', width: 150, scrollSnapAlign: 'start', textAlign: 'left',
                padding: 14, borderRadius: 16, background: '#fff', position: 'relative',
                border: `2px solid ${on ? '#6b2de6' : '#eceaf3'}`,
                boxShadow: on ? '0 12px 30px rgba(107,45,230,.14)' : '0 2px 8px rgba(30,20,70,.05)',
                transition: 'border-color .15s ease, box-shadow .15s ease, transform .15s ease',
                transform: on ? 'translateY(-2px)' : 'none',
              }}
            >
              <div
                style={{
                  width: '100%', aspectRatio: '1 / 1', borderRadius: 12, background: c.tint,
                  display: 'grid', placeItems: 'center', fontSize: 44,
                }}
              >
                <span aria-hidden="true">{c.emoji}</span>
              </div>
              {on && (
                <span
                  style={{
                    position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: '50%',
                    background: '#6b2de6', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800,
                  }}
                >
                  ✓
                </span>
              )}
              <div style={{ fontWeight: 800, fontSize: 15, marginTop: 12, color: on ? '#5b28d9' : '#12121c' }}>
                {c.label}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.35, color: '#6b6d78', marginTop: 3 }}>{c.blurb}</div>
            </button>
          )
        })}

        {/* host-defined cards */}
        {customIds.map((id) => (
          <button
            type="button"
            key={id}
            onClick={() => toggle(id)}
            className="btn-plain"
            title="Your category — tap to remove"
            style={{
              flex: '0 0 auto', width: 150, scrollSnapAlign: 'start', textAlign: 'left',
              padding: 14, borderRadius: 16, background: '#fff', position: 'relative',
              border: '2px solid #6b2de6', boxShadow: '0 12px 30px rgba(107,45,230,.14)', transform: 'translateY(-2px)',
            }}
          >
            <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, background: 'linear-gradient(160deg,#f3eaff,#e5d6ff)', display: 'grid', placeItems: 'center', fontSize: 44 }}>
              ✨
            </div>
            <span style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: '50%', background: '#6b2de6', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>✓</span>
            <div style={{ fontWeight: 800, fontSize: 15, marginTop: 12, color: '#5b28d9' }}>{catLabel(id)}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.35, color: '#6b6d78', marginTop: 3 }}>Your custom category</div>
          </button>
        ))}
      </div>

      {/* name your own */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="field"
          style={{ fontSize: 14, padding: '11px 14px' }}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          placeholder="Add your own category — sneakers, startups, anything"
          maxLength={24}
        />
        <button
          type="button"
          className="btn-plain"
          onClick={addCustom}
          disabled={!custom.trim()}
          style={{ padding: '0 22px', borderRadius: 12, fontWeight: 700, border: '1.5px solid #e6e2f5', background: custom.trim() ? '#efeafd' : '#f3f1fa', color: custom.trim() ? '#5b28d9' : '#b7b0d4' }}
        >
          Add
        </button>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.45, color: '#9c94bd' }}>
        {teamDraft
          ? 'Fantasy League runs as a team draft — four squads share a purse. Combine it with anything.'
          : 'Pick as many as you like — the room mixes their items.'}
      </p>
    </div>
  )
}
