import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeAtomicJson } from './atomicJson.js';

export type WatchItem = { id: string; name: string; aliases: string[]; note?: string; createdAt: string };
export type AliasEntry = { canonical: string; aliases: string[] };
export type UserConfig = { watchlist: WatchItem[]; aliases: AliasEntry[] };

const CONFIG_PATH = path.resolve(process.env.USER_CONFIG_FILE || 'data/runtime/user-config.json');
const LEGACY_PATH = path.resolve('data/user-config.json');
let saving: Promise<unknown> = Promise.resolve();

export async function readUserConfig(): Promise<UserConfig> {
  let text: string;
  try {
    text = await fs.readFile(CONFIG_PATH, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try { text = await fs.readFile(LEGACY_PATH, 'utf8'); }
    catch (legacyError) {
      if ((legacyError as NodeJS.ErrnoException).code !== 'ENOENT') throw legacyError;
      return { watchlist: [], aliases: [] };
    }
  }
  // A corrupt file must remain available for recovery, never overwritten by a read.
  const config = JSON.parse(text) as UserConfig;
  if (!config || !Array.isArray(config.watchlist) || !Array.isArray(config.aliases)
    || !config.watchlist.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && stringArray(item.aliases))
    || !config.aliases.every(item => item && typeof item.canonical === 'string' && stringArray(item.aliases))) {
    throw new Error('USER_CONFIG_INVALID');
  }
  return config;
}

function change(work: (config: UserConfig) => void): Promise<UserConfig> {
  const job = saving.then(async () => {
    const config = await readUserConfig();
    work(config);
    await writeAtomicJson(CONFIG_PATH, config);
    return config;
  });
  saving = job.catch(() => undefined);
  return job;
}

export function addWatchItem(input: { name: string; aliases?: string[]; note?: string }): Promise<UserConfig> {
  return change(config => {
    const name = requiredName(input.name);
    const aliases = uniqueStrings([name, ...checkedAliases(input.aliases ?? [])]);
    if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 4000)) throw new Error('USER_CONFIG_INVALID');
    const existing = config.watchlist.find(item => item.name === name);
    if (existing) {
      existing.aliases = uniqueStrings([...existing.aliases, ...aliases]);
      existing.note = input.note ?? existing.note;
    } else config.watchlist.push({ id: randomUUID(), name, aliases, note: input.note, createdAt: new Date().toISOString() });
  });
}

export function removeWatchItem(id: string): Promise<UserConfig> {
  return change(config => { config.watchlist = config.watchlist.filter(item => item.id !== id); });
}

export function addAlias(input: { canonical: string; aliases: string[] }): Promise<UserConfig> {
  return change(config => {
    const canonical = requiredName(input.canonical);
    const aliases = uniqueStrings([canonical, ...checkedAliases(input.aliases)]);
    const existing = config.aliases.find(item => item.canonical === canonical);
    if (existing) existing.aliases = uniqueStrings([...existing.aliases, ...aliases]);
    else config.aliases.push({ canonical, aliases });
  });
}
function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
function requiredName(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('USER_CONFIG_INVALID');
  return value.trim();
}
function checkedAliases(values: string[]) {
  if (!stringArray(values) || values.length > 100 || values.some(item => item.length > 200)) throw new Error('USER_CONFIG_INVALID');
  return values;
}
function uniqueStrings(values: string[]) { return [...new Set(values.map(value => value.trim()).filter(Boolean))]; }
