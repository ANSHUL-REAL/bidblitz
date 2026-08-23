'use client'
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

/**
 * How a host actually gets people into the room.
 *
 * The big screen has always had a QR, which works when everyone is standing in
 * front of a projector and nowhere else. Most invites are sent before anyone is
 * in the room — pasted into a group chat — so the link has to be a thing you
 * can copy in one tap.
 *
 * Three ways out, in the order people reach for them:
 *   Share  — the native sheet (WhatsApp, Messages, AirDrop). Phones only, and
 *            only over HTTPS or localhost, so it is offered when present.
 *   Copy   — the fallback that works everywhere.
 *   QR     — for the person standing next to you.
 *
 * `url` is built from window.location.origin by the caller, so it is whatever
 * host the room is actually being served from — localhost in dev, the real
 * domain in production, with no env var to forget.
 */
export function InviteCard({ url, code, title, compact = false }) {
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState(null)
  const [showQr, setShowQr] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    // navigator.share only exists on some browsers and only in a secure
    // context, so this is a capability check rather than a device guess.
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  useEffect(() => {
    if (!showQr || !url || qr) return
    QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: '#12121c', light: '#ffffff' } })
      .then(setQr)
      .catch(() => {})
  }, [showQr, url, qr])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      timer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard is blocked in some embedded browsers; the field below is
      // selectable, so there is still a way to get the link out.
    }
  }

  const share = async () => {
    try {
      await navigator.share({
        title: title ? `Join ${title} on BidBlitz` : 'Join my BidBlitz auction',
        text: `Join my live auction — room ${code}`,
        url,
      })
    } catch {
      // Cancelling the share sheet throws. Not an error worth showing.
    }
  }

  return (
    <div style={{ background: compact ? 'transparent' : '#fff', borderRadius: 14, padding: compact ? 0 : 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 10, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 800 }}>
          INVITE
        </span>
        <button
          type="button" className="btn-plain" onClick={() => setShowQr((v) => !v)}
          style={{ padding: '3px 8px', borderRadius: 7, background: 'transparent', color: '#5b28d9', fontWeight: 700, fontSize: 11.5 }}
        >
          {showQr ? 'Hide QR' : 'QR'}
        </button>
      </div>

      <div
        style={{
          fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 26,
          letterSpacing: '.26em', color: '#6b2de6', marginTop: 4,
        }}
      >
        {code}
      </div>

      {showQr && qr && (
        <img
          src={qr} alt={`QR code to join room ${code}`}
          style={{ width: 148, height: 148, display: 'block', margin: '10px auto 0', borderRadius: 10, background: '#fff' }}
        />
      )}

      {/* readOnly rather than disabled: a disabled input cannot be selected, and
          selecting the text by hand is the last resort when the clipboard API
          is blocked. */}
      <input
        readOnly value={url}
        onFocus={(e) => e.target.select()}
        style={{
          width: '100%', marginTop: 9, padding: '9px 10px', borderRadius: 9,
          border: '1px solid #e6e2f5', background: '#fbfaff',
          fontFamily: "'DM Mono',monospace", fontSize: 11.5, color: '#5a5470',
        }}
      />

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          type="button" className="btn-plain" onClick={copy}
          style={{
            flex: 1, padding: '11px 0', borderRadius: 10, fontWeight: 800, fontSize: 13,
            background: copied ? '#efeafd' : '#6b2de6', color: copied ? '#5b28d9' : '#fff',
          }}
        >
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        {canShare && (
          <button
            type="button" className="btn-plain" onClick={share}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10, fontWeight: 800, fontSize: 13,
              border: '1.5px solid #e6e2f5', background: '#fff', color: '#5b28d9',
            }}
          >
            Share
          </button>
        )}
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9c94bd', lineHeight: 1.45 }}>
        Anyone with this link can join. They can also type the code at bidblitz.
      </p>
    </div>
  )
}

/** Same card, over the page, for a host mid-auction who needs the link again. */
export function InviteDialog({ url, code, title, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 65, background: 'rgba(18,18,28,.55)', display: 'grid', placeItems: 'center', padding: 18 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, padding: 20, width: '100%', maxWidth: 360 }}
      >
        <InviteCard url={url} code={code} title={title} compact />
        <button
          type="button" className="btn-plain" onClick={onClose}
          style={{ width: '100%', marginTop: 12, padding: '11px 0', borderRadius: 10, background: '#f3f1fa', color: '#6b6d78', fontWeight: 700, fontSize: 13.5 }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

/** The absolute join URL for a room, from whatever origin is serving the app. */
export function useRoomUrl(path) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (typeof window !== 'undefined') setUrl(`${window.location.origin}${path}`)
  }, [path])
  return url
}
