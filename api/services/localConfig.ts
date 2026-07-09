import fs from 'node:fs/promises';
import path from 'node:path';

export type WatchItem = {
  id: string;
  name: string;
  aliases: string[];
  note?: string;
  createdAt: string;
};

export type AliasEntry = {
  canonical: string;
  aliases: string[];
};

export type UserConfig = {
  watchlist: WatchItem[];
  aliases: AliasEntry[];
};

const CONFIG_PATH = path.resolve(process.cwd(), 'data/user-config.json');

const DEFAULT_CONFIG: UserConfig = {
  watchlist: [],
  aliases: [],
};

export async function readUserConfig(): Promise<UserConfig> {
  try {
    const content = await fs.readFile(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    await writeUserConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
}

export async function addWatchItem(input: {
  name: string;
  aliases?: string[];
  note?: string;
}): Promise<UserConfig> {
  const config = await readUserConfig();
  const existing = config.watchlist.find((item) => item.name === input.name);
  if (existing) {
    existing.aliases = uniqueStrings([...existing.aliases, ...(input.aliases ?? [])]);
    existing.note = input.note ?? existing.note;
  } else {
    config.watchlist.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: input.name,
      aliases: uniqueStrings([input.name, ...(input.aliases ?? [])]),
      note: input.note,
      createdAt: new Date().toISOString(),
    });
  }
  await writeUserConfig(config);
  return config;
}

export async function removeWatchItem(id: string): Promise<UserConfig> {
  const config = await readUserConfig();
  config.watchlist = config.watchlist.filter((item) => item.id !== id);
  await writeUserConfig(config);
  return config;
}

export async function addAlias(input: { canonical: string; aliases: string[] }): Promise<UserConfig> {
  const config = await readUserConfig();
  const existing = config.aliases.find((item) => item.canonical === input.canonical);
  if (existing) {
    existing.aliases = uniqueStrings([...existing.aliases, ...input.aliases, input.canonical]);
  } else {
    config.aliases.push({
      canonical: input.canonical,
      aliases: uniqueStrings([input.canonical, ...input.aliases]),
    });
  }
  await writeUserConfig(config);
  return config;
}

async function writeUserConfig(config: UserConfig): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
