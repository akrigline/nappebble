// Which baby the watch is acting on. With one baby the switcher is hidden
// (hasChoice false); with several, the saved choice wins and the first baby
// is the fallback when nothing is saved or the saved baby is gone.

function resolveActiveBaby(babies, savedId) {
  if (babies.length === 0) return { baby: null, hasChoice: false };
  const saved = babies.find((b) => b.id === savedId);
  return { baby: saved || babies[0], hasChoice: babies.length > 1 };
}

// Names a baby on the wire. The watch repeats it on every write so the phone can tell the
// baby the watch is showing from the one it would log to. A list position can't do that: it
// is the same number for a different baby after the list is reordered or the token changes.
// A 31-bit FNV-1a hash of the whole id (a time-ordered id shares its first digits with its
// neighbours), kept positive for a signed AppMessage integer, and never 0 (the watch's "none").
function babyKey(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0; // h * 16777619 mod 2^32
  }
  return (h & 0x7fffffff) || 1;
}

module.exports = { resolveActiveBaby, babyKey };
