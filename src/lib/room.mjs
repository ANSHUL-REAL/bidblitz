/**
 * Room codes.
 *
 * A code is just the on-chain roomId in base36, so it round-trips exactly and
 * needs no lookup table. Padded to 4 characters so it reads as a code rather
 * than a database id, and uppercased because people type it off a screen.
 */
export const roomCode = (id) => Number(id || 0).toString(36).toUpperCase().padStart(4, '0')

export const roomIdFromCode = (code) => {
  const n = parseInt(String(code ?? '').trim().replace(/[^0-9a-z]/gi, ''), 36)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const roomUrl = (id) => `/r/${roomCode(id)}`

export const sanitizeRoomName = (s) =>
  (s ?? '').replace(/["\n\r\\]/g, '').trim().slice(0, 40)
