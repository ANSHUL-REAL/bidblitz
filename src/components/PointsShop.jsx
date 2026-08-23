'use client'
import { useState } from 'react'
import { formatAmount } from '../lib/format.mjs'
import { InjectedSigner, hasInjectedWallet } from '../lib/wallet.mjs'
import { PACKS, TREASURY, hasTreasury, packWei, topupMemo, TOPUP_GAS } from '../lib/topups.mjs'

/**
 * Buying points in a free room.
 *
 * Playing a free room needs no wallet. BUYING does, because the payment is real
 * MON on Monad — there is no way around that, and pretending otherwise would
 * mean custodying someone's money.
 *
 * The purchase is two steps that must not be conflated: the wallet sends the
 * payment, then the server independently verifies it on-chain before crediting
 * anything. A signed transaction is not a credit — /api/free/topup re-reads the
 * whole thing from the chain and can refuse it.
 */
export function PointsShop({ code, playerId, onCredited }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)   // pack id currently being bought
  const [step, setStep] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  if (!hasTreasury) return null

  async function buy(pack) {
    if (busy) return
    setBusy(pack.id)
    setError('')
    setDone(null)
    try {
      setStep('Connecting wallet…')
      const signer = await InjectedSigner.connect()

      setStep(`Confirm ${pack.mon} MON in your wallet…`)
      const txHash = await signer.sendValue(
        TREASURY,
        packWei(pack),
        topupMemo(code, playerId),   // binds this payment to this player
        TOPUP_GAS,
      )

      setStep('Waiting for confirmation…')
      const credited = await claim({ code, playerId, txHash })
      setDone(credited)
      onCredited?.(credited)
      setStep('')
    } catch (err) {
      setError(String(err?.message || err))
      setStep('')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto 18px' }}>
      {!open ? (
        <button
          type="button"
          className="btn-plain"
          onClick={() => setOpen(true)}
          style={{
            width: '100%', padding: '14px 18px', borderRadius: 14,
            border: '2px dashed #d8c9f5', background: '#fbf9ff',
            fontWeight: 800, fontSize: 15, color: '#5b28d9',
          }}
        >
          ⚡ Out of purse? Get more points
        </button>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #eeecf7', borderRadius: 18, padding: 20, boxShadow: '0 22px 60px rgba(30,20,70,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: '-.02em' }}>
                More points
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#6b6d78', lineHeight: 1.45 }}>
                Pay real MON, get more paddle in this room.
              </p>
            </div>
            <button
              type="button" className="btn-plain" onClick={() => setOpen(false)}
              style={{ padding: '6px 10px', borderRadius: 8, background: '#f3f1fa', color: '#6b6d78', fontWeight: 700, fontSize: 13 }}
            >
              Close
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginTop: 16 }}>
            {PACKS.map((pack) => {
              const active = busy === pack.id
              return (
                <button
                  key={pack.id}
                  type="button"
                  className="btn-plain"
                  disabled={Boolean(busy)}
                  onClick={() => buy(pack)}
                  style={{
                    position: 'relative', textAlign: 'left', padding: '14px 15px', borderRadius: 13,
                    border: `2px solid ${active ? '#6b2de6' : '#e6e2f5'}`,
                    background: active ? '#efeafd' : '#fff',
                    opacity: busy && !active ? .5 : 1,
                  }}
                >
                  {pack.bonus > 0 && (
                    <span
                      style={{
                        position: 'absolute', top: -9, right: 10, fontSize: 10, fontWeight: 800,
                        letterSpacing: '.08em', color: '#12703a', background: '#d8f5e5',
                        padding: '3px 7px', borderRadius: 999,
                      }}
                    >
                      +{pack.bonus}%
                    </span>
                  )}
                  <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 24, letterSpacing: '-.03em', color: '#12121c' }}>
                    {pack.points}
                    <span style={{ fontSize: 12, marginLeft: 5, color: '#6b6d78' }}>PTS</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#5b28d9', marginTop: 2 }}>
                    {pack.mon} MON
                  </div>
                </button>
              )
            })}
          </div>

          {step && (
            <p style={{ margin: '14px 0 0', fontSize: 13.5, fontWeight: 700, color: '#5b28d9' }}>{step}</p>
          )}

          {done && (
            <p style={{ margin: '14px 0 0', padding: '11px 13px', borderRadius: 10, background: '#e9f9ef', color: '#12703a', fontSize: 14, fontWeight: 700 }}>
              {done.alreadyCredited ? 'Already credited' : `+${formatAmount(done.points)} PTS added to your purse`}
            </p>
          )}

          {error && (
            <p style={{ margin: '14px 0 0', color: '#c0392b', fontSize: 13.5, wordBreak: 'break-word' }}>{error}</p>
          )}

          {!hasInjectedWallet() && (
            <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#9c94bd', lineHeight: 1.5 }}>
              Buying needs a wallet (MetaMask, Rabby, OKX, Backpack) with testnet MON —
              playing this room does not.
            </p>
          )}

          <p style={{ margin: '14px 0 0', fontSize: 12, color: '#9c94bd', lineHeight: 1.5 }}>
            Points are a score inside this room. They are <strong>not</strong> a currency,
            cannot be converted back to MON, cannot be moved to another room, and are
            non-refundable. MON rooms have no packs — there you bid your own MON directly.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Ask the server to verify the payment and credit it.
 *
 * Retries on 202 because the transaction may not be mined or buried deep enough
 * yet. Giving up here would be the worst outcome available: the buyer's MON has
 * already left their wallet, so this keeps asking until the chain agrees.
 */
async function claim({ code, playerId, txHash, tries = 25 }) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch('/api/free/topup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, playerId, txHash }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return data
    if (res.status !== 202) throw new Error(data.error || `could not credit (${res.status})`)
    await new Promise((r) => setTimeout(r, 1200))
  }
  throw new Error(
    `Payment sent but not credited yet. Keep this tx hash and reload: ${txHash}`,
  )
}
