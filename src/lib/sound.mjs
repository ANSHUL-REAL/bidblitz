/**
 * Synthesised audio — no asset files, nothing to host, nothing for venue wifi
 * to fail to load. A gavel and a bid ding are worth a surprising fraction of
 * the excitement in the room.
 *
 * Browsers block audio until a user gesture, which is why /screen has a START
 * button: its click handler calls unlock() to open the AudioContext. Without
 * that the big screen is silent all night and you find out on stage.
 */
let ctx = null

export function unlock() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  // A zero-length buffer is enough to move the context out of "suspended".
  const b = ctx.createBuffer(1, 1, 22050)
  const s = ctx.createBufferSource()
  s.buffer = b
  s.connect(ctx.destination)
  s.start(0)
  ctx.resume?.()
  return ctx
}

export const isUnlocked = () => Boolean(ctx && ctx.state === 'running')

function tone({ freq, duration = 0.12, type = 'sine', gain = 0.25, sweepTo, delay = 0 }) {
  if (!ctx) return
  const t0 = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration)

  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

  osc.connect(amp).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function noise({ duration = 0.18, gain = 0.35, delay = 0 }) {
  if (!ctx) return
  const t0 = ctx.currentTime + delay
  const frames = Math.floor(ctx.sampleRate * duration)
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2
  }
  const src = ctx.createBufferSource()
  const amp = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900

  amp.gain.setValueAtTime(gain, t0)
  src.buffer = buf
  src.connect(filter).connect(amp).connect(ctx.destination)
  src.start(t0)
}

/** Short bright blip each time a new bid lands. */
export const dingBid = () => tone({ freq: 880, sweepTo: 1320, duration: 0.1, type: 'triangle', gain: 0.18 })

/** Rising three-note sting when a lot opens. */
export function fanfareStart() {
  tone({ freq: 523, duration: 0.12, type: 'triangle', gain: 0.16 })
  tone({ freq: 659, duration: 0.12, type: 'triangle', gain: 0.16, delay: 0.11 })
  tone({ freq: 880, duration: 0.22, type: 'triangle', gain: 0.2, delay: 0.22 })
}

/** Gavel: a low wooden knock plus a thud. */
export function gavel() {
  noise({ duration: 0.16, gain: 0.5 })
  tone({ freq: 180, sweepTo: 70, duration: 0.22, type: 'square', gain: 0.28 })
  noise({ duration: 0.12, gain: 0.3, delay: 0.13 })
  tone({ freq: 150, sweepTo: 60, duration: 0.2, type: 'square', gain: 0.22, delay: 0.13 })
}

/** Urgency tick in the final seconds. */
export const tick = () => tone({ freq: 1400, duration: 0.045, type: 'square', gain: 0.1 })
