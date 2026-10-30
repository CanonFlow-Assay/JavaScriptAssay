export const readStock = async (url) => {
  for (const attempt of [0, 1]) {
    try {
      const reply = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (reply.status === 503 && attempt === 0) continue;
      if (!reply.ok) return Object.freeze({ kind: 'Unavailable' });
      let raw;
      try {
        raw = await reply.json();
      } catch {
        return Object.freeze({ kind: 'InvalidReply' });
      }
      if (
        raw === null ||
        typeof raw !== 'object' ||
        typeof raw.stock !== 'number' ||
        !Number.isSafeInteger(raw.stock) ||
        raw.stock < 0
      )
        return Object.freeze({ kind: 'InvalidReply' });
      return Object.freeze({ kind: 'Available', stock: raw.stock });
    } catch {
      return Object.freeze({ kind: 'Unavailable' });
    }
  }
  return Object.freeze({ kind: 'Unavailable' });
};
