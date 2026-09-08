// Source excerpts recur in mentions, opinions, and cached views. Intern long
// strings on disk without shortening any evidence or changing the public data.
export function packSnapshotStrings(value: unknown) {
  const strings: string[] = [];
  const ids = new Map<string, number>();
  function pack(item: unknown): unknown {
    if (typeof item === 'string' && item.length >= 128) {
      let id = ids.get(item);
      if (id === undefined) { id = strings.length; ids.set(item, id); strings.push(item); }
      return { $snapshotString: id };
    }
    if (Array.isArray(item)) return item.map(pack);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, pack(child)]));
    return item;
  }
  const root = pack(value);
  return { strings, root };
}

export function unpackSnapshotStrings(value: { strings: string[]; root: unknown }): unknown {
  if (!Array.isArray(value.strings) || !value.strings.every((item) => typeof item === 'string')) throw new Error('Invalid snapshot string table');
  function unpack(item: unknown): unknown {
    if (!item || typeof item !== 'object') return item;
    if (Array.isArray(item)) { for (let i = 0; i < item.length; i++) item[i] = unpack(item[i]); return item; }
    const object = item as Record<string, unknown>;
    if (Object.keys(object).length === 1 && '$snapshotString' in object) {
      const id = object.$snapshotString;
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= value.strings.length) throw new Error('Invalid snapshot string reference');
      return value.strings[id];
    }
    for (const key of Object.keys(object)) object[key] = unpack(object[key]);
    return object;
  }
  return unpack(value.root);
}
