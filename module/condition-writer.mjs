// Different condition workflows must not inspect and mutate the same actor
// concurrently. The acting-GM guard selects a connection; this queue orders
// its encumbrance and ability-collapse writes within that connection.
const pending = new Map();

export async function withActorConditionWriter(actor, work) {
  // Synthetic actors share a base actor id, so use the complete token UUID.
  const key = actor?.uuid ?? actor?.id;
  if (!key) return work();
  const previous = pending.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  pending.set(key, next);
  try { return await next; }
  finally { if (pending.get(key) === next) pending.delete(key); }
}
