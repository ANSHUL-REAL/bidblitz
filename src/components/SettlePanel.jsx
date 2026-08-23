'use client'
import { useState } from 'react'
import { useCountdown, formatCountdown } from '../lib/useAuction'
import { formatAmount } from '../lib/format.mjs'
import { txUrl } from '../lib/chain.mjs'

/**
 * The gap between winning a real-MON lot and paying for it.
 *
 * A bid used to BE the payment — msg.value moved with every tap. It doesn't any
 * more: the clock picks a winner, and the winner then settles. That gap needs a
 * screen, because it is the only moment in the auction where the room is
 * waiting on one specific person.
 *
 * So all three parties see the same countdown, from their own angle:
 *   the winner  — pay now, and how long is left
 *   the host    — who owes what, and re-run it if they don't
 *   everyone    — why the room has paused
 *
 * Play-money rooms never render this: nothing is owed.
 */
export function SettlePanel({ state, signer, roomId, isHost, onDone }) {
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)

  const payBy = Number(state?.payBy || 0)
  const owed = BigInt(state?.highestBid || 0)
  const remaining = useCountdown(payBy, state?.chainNow, state?.fetchedAt)

  // payBy is only ever set on a real-MON lot with a winner who has not paid.
  if (!state?.escrow || !payBy || state?.paid || owed === 0n) return null

  const winner = state?.bidder
  const iAmWinner = winner && signer?.address &&
    winner.toLowerCase() === signer.address.toLowerCase()
  const expired = remaining <= 0

  async function act(fn, label) {
    if (busy) return
    setBusy(true)
    setFlash(null)
    try {
      const hash = await fn()
      setFlash({ ok: true, text: label, hash })
      setTimeout(() => onDone?.(), 900)
    } catch (err) {
      await signer?.syncNonce?.().catch(() => {})
      setFlash({ ok: false, text: String(err?.message || err).slice(0, 120) })
    } finally {
      setBusy(false)
    }
  }

  const accent = expired ? '#c0392b' : iAmWinner ? '#5b28d9' : '#8a5a00'
  const tint = expired ? '#fdecea' : iAmWinner ? '#efeafd' : '#fff8ec'

  return (
    <div
      style={{
        maxWidth: 620, margin: '18px auto 0', padding: 18, borderRadius: 16,
        background: tint, border: `1px solid ${accent}33`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 11, letterSpacing: '.16em', fontWeight: 800, color: accent }}>
          {expired ? 'PAYMENT MISSED' : 'AWAITING PAYMENT'}
        </span>
        {!expired && (
          <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 22, color: accent }}>
            {formatCountdown(remaining)}s
          </span>
        )}
      </div>

      {iAmWinner ? (
        <>
          <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: '-.03em', marginTop: 6 }}>
            🎉 You won {state.lname}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5, color: '#3a3c44' }}>
            {expired
              ? 'The window closed before this was paid. The host can put it back on the block, and you may be barred from bidding in this room.'
              : <>Pay <strong>{formatAmount(owed)} MON</strong> to the host to claim it. Your bid didn’t move any MON — this is the payment.</>}
          </p>

          {!expired && (
            <button
              className="btn-plain" disabled={busy}
              onClick={() => act(() => signer.payLot(roomId, state.lotId, owed), 'Paid — it’s yours')}
              style={{
                width: '100%', marginTop: 14, padding: '18px 0', borderRadius: 14,
                background: '#5b28d9', color: '#fff', fontFamily: "'Archivo',sans-serif",
                fontWeight: 900, fontSize: 19, letterSpacing: '.05em',
                boxShadow: '0 12px 28px rgba(107,45,230,.28)', opacity: busy ? .6 : 1,
              }}
            >
              PAY {formatAmount(owed)} MON
            </button>
          )}
        </>
      ) : (
        <>
          <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 19, letterSpacing: '-.03em', marginTop: 6 }}>
            {state.lname} — {formatAmount(owed)} MON
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.5, color: '#3a3c44' }}>
            {expired
              ? 'The winner didn’t pay in time.'
              : 'Waiting for the winner to pay. The auction continues once they do.'}
          </p>
        </>
      )}

      {/* Re-running is the host's remedy, but anyone may trigger it once the
          window has closed — a room should not be stuck behind a host who
          stepped away. */}
      {expired && (
        <button
          className="btn-plain" disabled={busy}
          onClick={() => act(() => signer.defaultLot(roomId, state.lotId), 'Lot released — run it again')}
          style={{
            width: '100%', marginTop: 12, padding: '15px 0', borderRadius: 13,
            background: isHost ? '#c0392b' : '#fff',
            color: isHost ? '#fff' : '#c0392b',
            border: isHost ? 'none' : '2px solid #f2d6d2',
            fontWeight: 800, fontSize: 15, opacity: busy ? .6 : 1,
          }}
        >
          PUT IT BACK ON THE BLOCK
        </button>
      )}

      {flash && (
        <p style={{ margin: '12px 0 0', fontSize: 13.5, fontWeight: 700, color: flash.ok ? '#5b28d9' : '#c0392b', wordBreak: 'break-word' }}>
          {flash.text}
          {flash.hash && (
            <>
              {' · '}
              <a href={txUrl(flash.hash)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                view tx ↗
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
