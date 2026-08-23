'use client'
import { useCallback, useEffect, useState } from 'react'
import { withdrawableOf } from '../lib/tx.mjs'
import { formatMon } from '../lib/format.mjs'
import { txUrl } from '../lib/chain.mjs'

/**
 * Real-MON escrow payouts, pulled by the caller. Shows only when the connected
 * wallet is actually owed something (pendingWithdrawals > 0), so it stays hidden
 * in play-money rooms entirely. Used two ways:
 *   - host console: collect a sold lot's winning bid ("Auction proceeds")
 *   - bidder room:  claim a refund after being outbid ("Refund available")
 * The withdraw() tx hash is shown as on-chain proof the MON reached the wallet.
 */
export function WithdrawPanel({ signer, label = 'Available to withdraw', claimLabel = 'Withdraw', accent = '#5b28d9' }) {
  const [amt, setAmt] = useState(0n)
  const [busy, setBusy] = useState(false)
  const [hash, setHash] = useState(null)
  const [err, setErr] = useState('')

  const refresh = useCallback(() => {
    if (!signer?.address) return
    withdrawableOf(signer.address).then((v) => setAmt(BigInt(v || 0n))).catch(() => {})
  }, [signer])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  if (!signer || (amt === 0n && !hash)) return null

  async function claim() {
    if (busy || amt === 0n) return
    setBusy(true); setErr('')
    try {
      await signer.syncNonce?.()
      const h = await signer.withdraw()
      setHash(h)
      setTimeout(refresh, 1500)
    } catch (e) {
      setErr(String(e?.message || e).slice(0, 120))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 14, background: `${accent}12`, border: `1.5px solid ${accent}55` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: '.12em', color: '#6b6d78', fontWeight: 700 }}>{label.toUpperCase()}</div>
          <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 26, color: accent }}>
            {formatMon(amt)}
          </div>
        </div>
        {amt > 0n && (
          <button
            type="button"
            onClick={claim}
            disabled={busy}
            className="btn-plain"
            style={{
              padding: '14px 22px', borderRadius: 12, background: busy ? '#cfd8d0' : accent, color: '#fff',
              fontWeight: 800, fontSize: 15, letterSpacing: '.03em',
            }}
          >
            {busy ? 'Sending…' : `${claimLabel} →`}
          </button>
        )}
      </div>
      {hash && (
        <div style={{ marginTop: 10, fontSize: 13, color: accent }}>
          Sent to your wallet ✓{' '}
          <a href={txUrl(hash)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
            view transaction ↗
          </a>
        </div>
      )}
      {err && <div style={{ marginTop: 8, fontSize: 13, color: '#c0392b' }}>{err}</div>}
    </div>
  )
}
