/**
 * Room formats.
 *
 * SOLO is the default and the point of the product: a general auction where
 * everyone bids as themselves on whatever the host puts up (memes, pictures,
 * anything), and a person can win one item or a dozen.
 *
 * SQUADS is the fantasy team format — four preset teams sharing a purse. It is
 * one mode among others, not the whole app.
 */
export const MODE = { SOLO: 0, SQUADS: 1 }

export const isSquads = (m) => Number(m) === MODE.SQUADS

export const modeLabel = (m) => (isSquads(m) ? 'Fantasy Squads' : 'Meme Auction')

export const modeBlurb = (m) =>
  isSquads(m)
    ? 'Four preset teams share a purse and draft players IPL-style.'
    : 'Everyone bids solo on anything you put up — memes, pictures, whatever.'
