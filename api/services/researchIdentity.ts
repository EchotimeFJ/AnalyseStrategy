import fs from 'node:fs/promises';
import { applySecurityAliases, securityAliasProvenance } from './securityAliases.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { writeAtomicJson } from './atomicJson.js';
import { normalizeSecurityCode } from './entityResolver.js';
import type {
  IdentityAliasAssignment,
  IdentityDictionaryInfo,
  IdentityGraph,
  IdentityMapping,
  IdentityMappingIndex,
  IdentityMentionLike,
  IdentityResolutionResult,
  IdentityVerificationState,
  InstrumentType,
  ListingIdentity,
  OrganizationIdentity,
  SecurityIdentity,
} from '../domain/identity.js';

type DictionaryEntry = { code: string; symbol: string; names: string[] };
type DictionaryFile = IdentityDictionaryInfo & { securities: DictionaryEntry[] };
type DictionaryIndex = {
  info: IdentityDictionaryInfo;
  entries: DictionaryEntry[];
  byCode: Map<string, DictionaryEntry>;
  byName: Map<string, DictionaryEntry[]>;
  componentByCode: Map<string, string>;
  componentByName: Map<string, Set<string>>;
  components: Map<string, DictionaryEntry[]>;
};

type NormalizedMention = {
  mentionKey: string;
  assignmentKey: string;
  mentionId?: string;
  rawName: string;
  aliases: string[];
  rawCode: string | null;
  resolvedCode: string | null;
  resolvedFromReview: boolean;
  reportId: string;
  articleRef: string;
  institution: string;
  lineNumber?: number;
  evidenceRefs: string[];
  roles: string[];
  signature: string;
};

type PersistedAssignment = IdentityMapping & { signature: string };
type IdentityIndexes = {
  organizationByKey: Record<string, string>;
  securityByCode: Record<string, string>;
  listingByCode: Record<string, string>;
  provenanceByKey: Record<string, string>;
  aliasByKey: Record<string, string>;
  issuerMerges: Record<string, string>;
};
type IdentityState = {
  version: 1;
  graph: IdentityGraph;
  assignments: Record<string, PersistedAssignment>;
  indexes: IdentityIndexes;
};

const stateLocks = new Map<string, Promise<unknown>>();
const UNSAFE_ALIASES = new Set(['CM', 'ESS', 'YOFC']);
const CODE_WITH_MARKET = /(?:\d{1,6}|[A-Z]{1,8})\s*(?:[.\s-])\s*(?:HK|SS|SH|SZ|BJ|US|TW|KS|KQ|JP|L|O|N|SI|CH|C1|C2)\b/gi;
const NAME_GENERIC = /^(?:公司|股票|个股|标的|行业|市场|主题|评级|目标价|未覆盖|未评级|未上市)$/i;
const dictionary = loadDictionary();

/**
 * Create the persistent three-layer identity adapter. The graph keeps opaque
 * UUIDs, while the private indexes only provide repeatable lookup keys for
 * this adapter; codes and names are never emitted as entity IDs.
 */
export function createIdentityStore(directory: string) {
  const root = path.resolve(directory);
  const stateFile = path.join(root, 'state.json');

  async function read(): Promise<IdentityState> {
    try {
      const value = JSON.parse(await fs.readFile(stateFile, 'utf8')) as IdentityState;
      validateState(value);
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
      throw error;
    }
  }

  function transaction<T>(work: (state: IdentityState) => Promise<T> | T): Promise<T> {
    const previous = stateLocks.get(root);
    const current = (async () => {
      await previous?.catch(() => undefined);
      const state = await read();
      const value = await work(state);
      await writeAtomicJson(stateFile, state);
      return value;
    })();
    stateLocks.set(root, current);
    void current.finally(() => {
      if (stateLocks.get(root) === current) stateLocks.delete(root);
    }).catch(() => undefined);
    return current;
  }

  async function resolveMentions(mentions: readonly IdentityMentionLike[]): Promise<IdentityResolutionResult> {
    return transaction((state) => {
      const normalized = mentions.map(mention => normalizeMention(mention));
      applyExplicitIssuerMerges(state, normalized);
      const mappingByIndex = normalized.map((mention) => {
        const previous = state.assignments[mention.assignmentKey];
        if (previous?.signature === mention.signature && mappingStillExists(state.graph, previous)) {
          refreshMentionProvenance(state, mention, previous);
          return stripAssignmentSignature(previous);
        }
        const mapping = resolveOne(state, mention);
        state.assignments[mention.assignmentKey] = { ...mapping, signature: mention.signature };
        return mapping;
      });
      const mapping = {} as IdentityMappingIndex;
      normalized.forEach((mention, index) => {
        const item = mappingByIndex[index];
        const key = mention.mentionId ?? mention.mentionKey;
        Object.defineProperty(mapping, key, { enumerable: true, configurable: true, writable: true, value: item });
      });
      return { identityGraph: structuredClone(state.graph), mapping, mappingByIndex };
    });
  }

  return { directory: root, read, resolveMentions };
}

function loadDictionary(): DictionaryIndex {
  const file = JSON.parse(readFileSync(new URL('../data/securities.json', import.meta.url), 'utf8')) as DictionaryFile;
  file.securities = applySecurityAliases(file.securities);
  file.sourceUrls = [...file.sourceUrls, securityAliasProvenance.sourceUrl];
  file.sources = [...file.sources, { file: securityAliasProvenance.file, sha256: securityAliasProvenance.sha256 }];
  const entries = file.securities
    .filter((entry) => entry && typeof entry.code === 'string' && typeof entry.symbol === 'string' && Array.isArray(entry.names))
    .map((entry) => ({ code: entry.code, symbol: entry.symbol, names: entry.names.filter((name): name is string => typeof name === 'string' && Boolean(name.trim())) }));
  const byCode = new Map(entries.map((entry) => [entry.code, entry]));
  const byName = new Map<string, DictionaryEntry[]>();
  const parent = entries.map((_entry, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const union = (left: number, right: number) => {
    const a = find(left), b = find(right);
    if (a !== b) parent[b] = a;
  };
  const firstName = new Map<string, number>();
  entries.forEach((entry, index) => {
    for (const name of entry.names) {
      const key = nameKey(name);
      if (!key || genericName(name) || shortAlias(name)) continue;
      const found = firstName.get(key);
      if (found === undefined) firstName.set(key, index);
      else union(found, index);
      const values = byName.get(key) ?? [];
      values.push(entry);
      byName.set(key, values);
    }
  });
  // Include short aliases in lookup, but never use them to join issuers.
  entries.forEach((entry) => {
    for (const name of entry.names) {
      const key = nameKey(name);
      if (!key) continue;
      const values = byName.get(key) ?? [];
      if (!values.includes(entry)) values.push(entry);
      byName.set(key, values);
    }
  });
  const membersByRoot = new Map<number, DictionaryEntry[]>();
  entries.forEach((entry, index) => {
    const root = find(index);
    membersByRoot.set(root, [...(membersByRoot.get(root) ?? []), entry]);
  });
  const componentByCode = new Map<string, string>();
  const components = new Map<string, DictionaryEntry[]>();
  for (const entriesForRoot of membersByRoot.values()) {
    const component = `component:${hash(entriesForRoot.map((entry) => entry.code).sort())}`;
    components.set(component, entriesForRoot);
    for (const entry of entriesForRoot) componentByCode.set(entry.code, component);
  }
  const componentByName = new Map<string, Set<string>>();
  for (const [key, values] of byName) {
    const componentsForName = new Set(values.map((entry) => componentByCode.get(entry.code)).filter((value): value is string => Boolean(value)));
    componentByName.set(key, componentsForName);
  }
  return {
    info: { asOf: typeof file.asOf === 'string' ? file.asOf : null, sourceUrls: file.sourceUrls ?? [], sources: file.sources ?? [] },
    entries,
    byCode,
    byName,
    componentByCode,
    componentByName,
    components,
  };
}

function emptyState(): IdentityState {
  return {
    version: 1,
    graph: {
      version: 1,
      dictionary: structuredClone(dictionary.info),
      organizations: [],
      securities: [],
      listings: [],
      aliases: [],
      provenance: [],
    },
    assignments: {},
    indexes: {
      organizationByKey: {},
      securityByCode: {},
      listingByCode: {},
      provenanceByKey: {},
      aliasByKey: {},
      issuerMerges: {},
    },
  };
}

function normalizeMention(input: IdentityMentionLike): NormalizedMention {
  const payload = input.payload;
  const rawName = sourceText(payload?.rawName ?? input.targetName ?? input.sourceName ?? '');
  const rawIdentifiers = payload?.rawIdentifiers ?? [];
  const identifierCodes = rawIdentifiers.filter((item) => item.interpretation === 'ticker').map((item) => sourceText(item.text ?? '')).filter(Boolean);
  const explicitRawCode = sourceText(payload?.rawCode ?? input.rawCode ?? identifierCodes[0] ?? '');
  const resolution = payload?.resolution;
  const reviewedCode = resolution?.status === 'resolved' ? cleanText(resolution.resolvedCode ?? '') : '';
  const directCode = cleanText(input.code ?? '');
  const excerpts = [input.excerpt ?? '', ...(input.evidence ?? []).map((item) => item.excerpt ?? '')];
  const codeHint = reviewedCode || directCode || explicitRawCode;
  // A TargetMention without a parsed code may quote many nearby securities.
  // Never infer its listing from that excerpt: no source code means an
  // organization candidate only. Reviewed rawIdentifiers/direct codes are
  // explicit identity evidence and may be checked against the dictionary.
  const normalizedCode = codeHint ? resolveDictionaryCode(codeHint, excerpts.join('\n')) : null;
  const rawCode = explicitRawCode || (normalizedCode ? rawCodeForCode(normalizedCode, excerpts.join('\n')) : '');
  const payloadAliases = payload && 'aliases' in payload ? stringsFromUnknown(payload.aliases) : [];
  const aliases = uniqueSourceStrings([
    ...(input.aliases ?? []),
    ...payloadAliases,
    ...rawIdentifiers.filter((item) => item.interpretation !== 'ticker').map((item) => item.text ?? ''),
    ...(resolution?.aliases ?? []),
  ]).filter((value) => nameKey(value) !== nameKey(rawName));
  const evidenceRefs = uniqueStrings([
    ...(input.evidenceIDs ?? []),
    ...(input.evidence ?? []).map((item) => item.evidenceId ?? ''),
    ...rawIdentifiers.flatMap((item) => item.evidenceIDs ?? []),
  ]);
  const mentionId = cleanText(input.id ?? input.mentionId ?? '');
  const articleRef = cleanText(payload?.articleRef ?? input.articleRef ?? '');
  const reportId = cleanText(input.reportId ?? '');
  const institution = cleanText(input.institution ?? '');
  const lineNumber = input.lineNumber ?? input.headingLineNumber ?? input.evidence?.find((item) => Number.isInteger(item.lineNumber))?.lineNumber;
  const mentionKey = mentionId || `mention:${hash({ reportId, articleRef, institution, lineNumber: lineNumber ?? null, rawName, rawCode })}`;
  const roles = payload?.roles ?? [];
  const signature = hash({ rawName, aliases, rawCode, normalizedCode, reportId, articleRef, institution, lineNumber: lineNumber ?? null, roles });
  return {
    mentionKey,
    assignmentKey: `assignment:${hash(mentionId || mentionKey)}`,
    mentionId: mentionId || undefined,
    rawName,
    aliases,
    rawCode: rawCode || null,
    resolvedCode: normalizedCode,
    resolvedFromReview: Boolean(reviewedCode),
    reportId,
    articleRef,
    institution,
    lineNumber,
    evidenceRefs,
    roles,
    signature,
  };
}

function resolveOne(state: IdentityState, mention: NormalizedMention): IdentityMapping {
  const mentionProvenance = ensureProvenance(state, {
    key: `mention:${mention.mentionKey}:${mention.signature}`,
    sourceKind: mention.mentionId ? 'review' : 'mention',
    sourceRef: mention.mentionId ?? mention.mentionKey,
    asOf: null,
    evidenceRefs: mention.evidenceRefs,
  });
  const primaryNameKeys = mention.rawName ? [nameKey(mention.rawName)] : [];
  const primaryComponents = new Set(primaryNameKeys.flatMap((key) => [...(dictionary.componentByName.get(key) ?? [])]).map((component) => canonicalComponent(state, component)));
  const aliasKeys = mention.aliases.map(nameKey).filter(Boolean);
  const nameComponents = primaryComponents.size
    ? primaryComponents
    : new Set(aliasKeys.flatMap((key) => [...(dictionary.componentByName.get(key) ?? [])]).map((component) => canonicalComponent(state, component)));
  const codeEntry = mention.resolvedCode ? dictionary.byCode.get(mention.resolvedCode) : undefined;
  const hasUnsafeAlias = UNSAFE_ALIASES.has(mention.rawName.toUpperCase());
  const rolesOnly = mention.roles.some((role) => ['terminology', 'publisher', 'analyst'].includes(role));
  if (rolesOnly) return unresolvedMapping(mention, mentionProvenance, 'role-not-security');

  if (codeEntry) {
    const codeComponent = canonicalComponent(state, dictionary.componentByCode.get(codeEntry.code)!);
    const nameConflicts = nameComponents.size > 0 && !nameComponents.has(codeComponent);
    const organization = ensureDictionaryOrganization(state, codeComponent, mention, mentionProvenance);
    const security = ensureDictionarySecurity(state, codeEntry, organization.organizationId, mention, mentionProvenance);
    const listing = ensureDictionaryListing(state, codeEntry, security.securityId, mention, mentionProvenance);
    const basis = [mention.resolvedFromReview ? 'review-resolution' : 'dictionary-code'];
    if (nameConflicts) {
      const candidates = [...nameComponents].map((component) => ensureDictionaryOrganization(state, component, mention, mentionProvenance).organizationId);
      return {
        mentionKey: mention.mentionKey, mentionId: mention.mentionId, rawName: mention.rawName, rawCode: mention.rawCode,
        resolvedCode: codeEntry.code, status: 'conflict', organizationId: organization.organizationId,
        securityId: security.securityId, listingId: listing.listingId, candidateOrganizationIds: uniqueStrings([organization.organizationId, ...candidates]),
        basis: [...basis, 'name-code-conflict'], provenanceRefs: [mentionProvenance],
      };
    }
    addMentionAliases(state, organization.organizationId, security.securityId, listing.listingId, mention, mentionProvenance);
    return {
      mentionKey: mention.mentionKey, mentionId: mention.mentionId, rawName: mention.rawName, rawCode: mention.rawCode,
      resolvedCode: codeEntry.code, status: 'resolved', organizationId: organization.organizationId,
      securityId: security.securityId, listingId: listing.listingId, candidateOrganizationIds: [organization.organizationId],
      basis: [...basis, ...(nameComponents.size ? ['dictionary-name'] : [])], provenanceRefs: [mentionProvenance],
    };
  }

  // A short abbreviation by itself is an unresolved identifier. It is kept in
  // the mapping and provenance, but cannot become a listing or force an issuer
  // merge (CM/ESS/YOFC are deliberately covered by this branch).
  if (hasUnsafeAlias) return candidateMapping(state, mention, mentionProvenance, 'ambiguous-abbreviation');
  if (nameComponents.size === 1) {
    const component = [...nameComponents][0];
    const organization = ensureDictionaryOrganization(state, component, mention, mentionProvenance);
    addMentionAliases(state, organization.organizationId, null, null, mention, mentionProvenance);
    return {
      mentionKey: mention.mentionKey, mentionId: mention.mentionId, rawName: mention.rawName, rawCode: mention.rawCode,
      resolvedCode: null, status: mention.rawCode ? 'unresolved' : 'resolved', organizationId: organization.organizationId,
      securityId: null, listingId: null, candidateOrganizationIds: [organization.organizationId],
      basis: [mention.rawCode ? 'unresolved-code' : 'dictionary-name', 'organization-only'], provenanceRefs: [mentionProvenance],
    };
  }
  if (nameComponents.size > 1) return candidateMapping(state, mention, mentionProvenance, 'ambiguous-name');
  return candidateMapping(state, mention, mentionProvenance, mention.rawCode ? 'unresolved-code' : 'unresolved-name');
}

function candidateMapping(state: IdentityState, mention: NormalizedMention, provenanceId: string, reason: string): IdentityMapping {
  if (!mention.rawName) return unresolvedMapping(mention, provenanceId, reason);
  const organization = ensureCandidateOrganization(state, mention, provenanceId, reason === 'ambiguous-name' ? 'ambiguous' : 'candidate');
  addMentionAliases(state, organization.organizationId, null, null, mention, provenanceId);
  return {
    mentionKey: mention.mentionKey, mentionId: mention.mentionId, rawName: mention.rawName, rawCode: mention.rawCode,
    resolvedCode: null, status: reason === 'ambiguous-name' || reason === 'ambiguous-abbreviation' ? 'ambiguous' : 'unresolved',
    organizationId: organization.organizationId, securityId: null, listingId: null, candidateOrganizationIds: [organization.organizationId],
    basis: [reason, 'organization-candidate'], provenanceRefs: [provenanceId],
  };
}

function unresolvedMapping(mention: NormalizedMention, provenanceId: string, reason: string): IdentityMapping {
  return {
    mentionKey: mention.mentionKey, mentionId: mention.mentionId, rawName: mention.rawName, rawCode: mention.rawCode,
    resolvedCode: mention.resolvedCode, status: 'unresolved', organizationId: null, securityId: null, listingId: null,
    candidateOrganizationIds: [], basis: [reason], provenanceRefs: [provenanceId],
  };
}

function ensureDictionaryOrganization(state: IdentityState, component: string, mention: NormalizedMention, mentionProvenance: string) {
  const key = `dictionary:${canonicalComponent(state, component)}`;
  const entries = dictionary.components.get(canonicalComponent(state, component)) ?? [];
  const aliases = uniqueStrings(entries.flatMap((entry) => entry.names));
  const canonicalName = chooseCanonicalName(aliases) || mention.rawName || '待识别组织';
  const legalName = aliases.find((name) => /(?:股份有限公司|有限公司|Corporation|Limited|Inc\.?|Corp\.?)/i.test(name)) ?? null;
  const organizationId = state.indexes.organizationByKey[key] ?? randomUUID();
  state.indexes.organizationByKey[key] = organizationId;
  let organization = state.graph.organizations.find((item) => item.organizationId === organizationId);
  const dictionaryProvenance = ensureProvenance(state, { key: `dictionary:${canonicalComponent(state, component)}`, sourceKind: 'dictionary', sourceRef: 'api/data/securities.json', asOf: dictionary.info.asOf, evidenceRefs: [] });
  if (!organization) {
    organization = { organizationId, canonicalName, legalName, entityKind: 'company', verificationState: 'verified', aliases, rawNames: [], provenanceRefs: [dictionaryProvenance], dictionaryAsOf: dictionary.info.asOf, validFrom: null, validTo: null, validity: 'unknown' };
    state.graph.organizations.push(organization);
  } else {
    organization.aliases = uniqueSourceStrings([...organization.aliases, ...aliases]);
    organization.provenanceRefs = uniqueStrings([...organization.provenanceRefs, dictionaryProvenance, mentionProvenance]);
  }
  addRawName(organization, mention.rawName);
  organization.provenanceRefs = uniqueStrings([...organization.provenanceRefs, mentionProvenance]);
  for (const alias of aliases) ensureAlias(state, 'organization', organization.organizationId, alias, 'dictionary_name', dictionaryProvenance, 'verified');
  return organization;
}

function ensureCandidateOrganization(state: IdentityState, mention: NormalizedMention, provenanceId: string, stateValue: IdentityVerificationState) {
  const key = `candidate:${mention.mentionKey}`;
  const organizationId = state.indexes.organizationByKey[key] ?? randomUUID();
  state.indexes.organizationByKey[key] = organizationId;
  let organization = state.graph.organizations.find((item) => item.organizationId === organizationId);
  if (!organization) {
    organization = { organizationId, canonicalName: mention.rawName || '待识别组织', legalName: null, entityKind: 'unknown', verificationState: stateValue, aliases: [], rawNames: [], provenanceRefs: [provenanceId], dictionaryAsOf: dictionary.info.asOf, validFrom: null, validTo: null, validity: 'unknown' };
    state.graph.organizations.push(organization);
  }
  addRawName(organization, mention.rawName);
  organization.provenanceRefs = uniqueStrings([...organization.provenanceRefs, provenanceId]);
  return organization;
}

function ensureDictionarySecurity(state: IdentityState, entry: DictionaryEntry, organizationId: string, mention: NormalizedMention, mentionProvenance: string): SecurityIdentity {
  const securityId = state.indexes.securityByCode[entry.code] ?? randomUUID();
  state.indexes.securityByCode[entry.code] = securityId;
  const dictionaryProvenance = ensureProvenance(state, { key: `dictionary-security:${entry.code}`, sourceKind: 'dictionary', sourceRef: `api/data/securities.json#${entry.code}`, asOf: dictionary.info.asOf, evidenceRefs: [] });
  let security = state.graph.securities.find((item) => item.securityId === securityId);
  if (!security) {
    security = { securityId, issuerOrganizationId: organizationId, displayName: chooseCanonicalName(entry.names) || entry.code, instrumentType: instrumentType(entry), verificationState: 'verified', aliases: uniqueStrings(entry.names), rawNames: [], provenanceRefs: [dictionaryProvenance], dictionaryAsOf: dictionary.info.asOf, validFrom: null, validTo: null, validity: 'unknown' };
    state.graph.securities.push(security);
  } else {
    security.issuerOrganizationId = organizationId;
    security.aliases = uniqueSourceStrings([...security.aliases, ...entry.names]);
    security.provenanceRefs = uniqueStrings([...security.provenanceRefs, dictionaryProvenance]);
  }
  addRawName(security, mention.rawName);
  security.provenanceRefs = uniqueStrings([...security.provenanceRefs, mentionProvenance]);
  for (const alias of entry.names) ensureAlias(state, 'security', security.securityId, alias, 'dictionary_name', dictionaryProvenance, 'verified');
  return security;
}

function ensureDictionaryListing(state: IdentityState, entry: DictionaryEntry, securityId: string, mention: NormalizedMention, mentionProvenance: string): ListingIdentity {
  const listingId = state.indexes.listingByCode[entry.code] ?? randomUUID();
  state.indexes.listingByCode[entry.code] = listingId;
  const dictionaryProvenance = ensureProvenance(state, { key: `dictionary-listing:${entry.code}`, sourceKind: 'dictionary', sourceRef: `api/data/securities.json#${entry.code}`, asOf: dictionary.info.asOf, evidenceRefs: [] });
  let listing = state.graph.listings.find((item) => item.listingId === listingId);
  const market = marketForCode(entry.code);
  if (!listing) {
    listing = { listingId, securityId, code: entry.code, symbol: entry.symbol, venue: venueForMarket(market), market, listingStatus: 'unknown', tradingCurrency: currencyForMarket(market), aliases: [], rawCodes: [], provenanceRefs: [dictionaryProvenance], dictionaryAsOf: dictionary.info.asOf, validFrom: null, validTo: null, validity: 'unknown' };
    state.graph.listings.push(listing);
  } else {
    listing.securityId = securityId;
    listing.provenanceRefs = uniqueStrings([...listing.provenanceRefs, dictionaryProvenance]);
  }
  if (mention.rawCode) listing.rawCodes = uniqueSourceStrings([...listing.rawCodes, mention.rawCode]);
  listing.provenanceRefs = uniqueStrings([...listing.provenanceRefs, mentionProvenance]);
  if (mention.aliases.length) listing.aliases = uniqueStrings([...listing.aliases, ...mention.aliases]);
  return listing;
}

function addMentionAliases(state: IdentityState, organizationId: string, securityId: string | null, listingId: string | null, mention: NormalizedMention, provenanceId: string) {
  if (mention.rawName) {
    const dictionaryNameMatch = dictionary.byName.get(nameKey(mention.rawName))?.length;
    ensureAlias(state, 'organization', organizationId, mention.rawName, dictionaryNameMatch ? 'dictionary_name' : 'source_name', provenanceId, dictionaryNameMatch ? 'verified' : 'candidate');
    if (securityId) ensureAlias(state, 'security', securityId, mention.rawName, dictionaryNameMatch ? 'dictionary_name' : 'source_name', provenanceId, dictionaryNameMatch ? 'verified' : 'candidate');
  }
  for (const alias of mention.aliases) {
    if (!alias || NAME_GENERIC.test(alias)) continue;
    const scheme = /^[A-Z]{2,8}$/.test(alias) ? 'abbreviation' : 'review_alias';
    ensureAlias(state, 'organization', organizationId, alias, scheme, provenanceId, 'candidate');
    if (securityId) ensureAlias(state, 'security', securityId, alias, scheme, provenanceId, 'candidate');
  }
  if (listingId && mention.rawCode) ensureAlias(state, 'listing', listingId, mention.rawCode, 'source_code', provenanceId, 'candidate');
}

function ensureAlias(state: IdentityState, targetKind: IdentityAliasAssignment['targetKind'], targetId: string, value: string, scheme: IdentityAliasAssignment['scheme'], provenanceId: string, verificationState: IdentityVerificationState) {
  const key = `${targetKind}:${targetId}:${nameKey(value)}:${scheme}`;
  const assignmentId = state.indexes.aliasByKey[key] ?? randomUUID();
  state.indexes.aliasByKey[key] = assignmentId;
  const target = targetKind === 'organization'
    ? state.graph.organizations.find((item) => item.organizationId === targetId)
    : targetKind === 'security'
      ? state.graph.securities.find((item) => item.securityId === targetId)
      : state.graph.listings.find((item) => item.listingId === targetId);
  if (target && 'aliases' in target) target.aliases = uniqueSourceStrings([...target.aliases, value]);
  const existing = state.graph.aliases.find((item) => item.assignmentId === assignmentId);
  if (existing) {
    existing.provenanceRefs = uniqueStrings([...existing.provenanceRefs, provenanceId]);
    return;
  }
  state.graph.aliases.push({ assignmentId, targetKind, targetId, value, scheme, provenanceRefs: [provenanceId], verificationState, validFrom: null, validTo: null, validity: 'unknown' });
}

function ensureProvenance(state: IdentityState, input: { key: string; sourceKind: 'dictionary' | 'mention' | 'review'; sourceRef: string; asOf: string | null; evidenceRefs: string[] }) {
  const existing = state.indexes.provenanceByKey[input.key];
  if (existing) {
    const item = state.graph.provenance.find((provenance) => provenance.provenanceId === existing);
    if (item) item.evidenceRefs = uniqueStrings([...item.evidenceRefs, ...input.evidenceRefs]);
    return existing;
  }
  const provenanceId = randomUUID();
  state.indexes.provenanceByKey[input.key] = provenanceId;
  state.graph.provenance.push({ provenanceId, sourceKind: input.sourceKind, sourceRef: input.sourceRef, asOf: input.asOf, sourceUrls: input.sourceKind === 'dictionary' ? [...dictionary.info.sourceUrls] : [], sourceFiles: input.sourceKind === 'dictionary' ? dictionary.info.sources.map((source) => source.file) : [], evidenceRefs: uniqueStrings(input.evidenceRefs) });
  return provenanceId;
}

function applyExplicitIssuerMerges(state: IdentityState, mentions: NormalizedMention[]) {
  // Components are joined only while loading the verified dictionary, where
  // a shared complete issuer name is explicit evidence. A same-line raw name
  // plus two codes is insufficient: it can be a company name followed by a
  // peer code or an abbreviation such as CM. Keep such conflicts separate.
  const groups = new Map<string, NormalizedMention[]>();
  for (const mention of mentions) {
    if (!mention.rawName || !mention.lineNumber || !mention.resolvedCode) continue;
    const location = `${mention.reportId}|${mention.articleRef}|${mention.institution}|${mention.lineNumber}|${nameKey(mention.rawName)}`;
    groups.set(location, [...(groups.get(location) ?? []), mention]);
  }
  for (const group of groups.values()) {
    const components = uniqueStrings(group.map((mention) => mention.resolvedCode ? dictionary.componentByCode.get(mention.resolvedCode) ?? '' : '').filter(Boolean)).map((component) => canonicalComponent(state, component));
    // A group already belonging to one dictionary issuer can share provenance;
    // a group spanning distinct issuers is retained as a conflict and never
    // merged merely because the raw name is repeated.
    if (components.length < 2 || new Set(components).size !== 1) continue;
    const component = components[0];
    const organizationId = state.indexes.organizationByKey[`dictionary:${component}`];
    if (!organizationId) continue;
    const provenanceId = ensureProvenance(state, { key: `issuer-evidence:${component}:${group[0].mentionKey}`, sourceKind: group.some((mention) => mention.mentionId) ? 'review' : 'mention', sourceRef: group[0].mentionKey, asOf: null, evidenceRefs: uniqueStrings(group.flatMap((mention) => mention.evidenceRefs)) });
    const organization = state.graph.organizations.find((item) => item.organizationId === organizationId);
    if (organization) organization.provenanceRefs = uniqueStrings([...organization.provenanceRefs, provenanceId]);
  }
}

function canonicalComponent(state: IdentityState, component: string) {
  let current = component;
  const seen = new Set<string>();
  while (state.indexes.issuerMerges[current] && !seen.has(current)) {
    seen.add(current);
    current = state.indexes.issuerMerges[current];
  }
  return current;
}

function mappingStillExists(graph: IdentityGraph, mapping: IdentityMapping) {
  return (!mapping.organizationId || graph.organizations.some((item) => item.organizationId === mapping.organizationId))
    && (!mapping.securityId || graph.securities.some((item) => item.securityId === mapping.securityId))
    && (!mapping.listingId || graph.listings.some((item) => item.listingId === mapping.listingId));
}

function stripAssignmentSignature(assignment: PersistedAssignment): IdentityMapping {
  const { signature, ...mapping } = assignment;
  void signature;
  return mapping;
}

function refreshMentionProvenance(state: IdentityState, mention: NormalizedMention, mapping: IdentityMapping) {
  const provenanceId = ensureProvenance(state, { key: `mention:${mention.mentionKey}:${mention.signature}`, sourceKind: mention.mentionId ? 'review' : 'mention', sourceRef: mention.mentionId ?? mention.mentionKey, asOf: null, evidenceRefs: mention.evidenceRefs });
  mapping.provenanceRefs = uniqueStrings([...mapping.provenanceRefs, provenanceId]);
}

function validateState(value: IdentityState) {
  if (!value || value.version !== 1 || !value.graph || value.graph.version !== 1 || !Array.isArray(value.graph.organizations) || !Array.isArray(value.graph.securities) || !Array.isArray(value.graph.listings) || !Array.isArray(value.graph.aliases) || !Array.isArray(value.graph.provenance) || !value.assignments || !value.indexes) throw new Error('IDENTITY_STORE_INVALID');
  const organizationIds = new Set<string>();
  const securityIds = new Set<string>();
  const listingIds = new Set<string>();
  const provenanceIds = new Set<string>();
  for (const organization of value.graph.organizations) {
    if (!isUuid(organization.organizationId) || organizationIds.has(organization.organizationId)) throw new Error('IDENTITY_STORE_INVALID');
    organizationIds.add(organization.organizationId);
    if (organization.redirectOrganizationId !== undefined && !isUuid(organization.redirectOrganizationId)) throw new Error('IDENTITY_STORE_INVALID');
  }
  for (const security of value.graph.securities) {
    if (!isUuid(security.securityId) || securityIds.has(security.securityId) || !isUuid(security.issuerOrganizationId)) throw new Error('IDENTITY_STORE_INVALID');
    securityIds.add(security.securityId);
  }
  for (const listing of value.graph.listings) {
    if (!isUuid(listing.listingId) || listingIds.has(listing.listingId) || !isUuid(listing.securityId)) throw new Error('IDENTITY_STORE_INVALID');
    listingIds.add(listing.listingId);
  }
  for (const provenance of value.graph.provenance) {
    if (!isUuid(provenance.provenanceId) || provenanceIds.has(provenance.provenanceId)) throw new Error('IDENTITY_STORE_INVALID');
    provenanceIds.add(provenance.provenanceId);
  }
  for (const security of value.graph.securities) if (!organizationIds.has(security.issuerOrganizationId)) throw new Error('IDENTITY_STORE_INVALID');
  for (const listing of value.graph.listings) if (!securityIds.has(listing.securityId)) throw new Error('IDENTITY_STORE_INVALID');
  for (const alias of value.graph.aliases) {
    const ids = alias.targetKind === 'organization' ? organizationIds : alias.targetKind === 'security' ? securityIds : listingIds;
    if (!isUuid(alias.assignmentId) || !ids.has(alias.targetId) || !Array.isArray(alias.provenanceRefs) || alias.provenanceRefs.some((id) => !provenanceIds.has(id))) throw new Error('IDENTITY_STORE_INVALID');
  }
  for (const [key, assignment] of Object.entries(value.assignments)) {
    if (!/^assignment:[a-f0-9]{64}$/.test(key) || assignment.signature.length !== 64 || !['resolved', 'ambiguous', 'unresolved', 'conflict'].includes(assignment.status)) throw new Error('IDENTITY_STORE_INVALID');
    if (assignment.organizationId && !organizationIds.has(assignment.organizationId) || assignment.securityId && !securityIds.has(assignment.securityId) || assignment.listingId && !listingIds.has(assignment.listingId)) throw new Error('IDENTITY_STORE_INVALID');
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function resolveDictionaryCode(value: string, sourceText: string) {
  // Once a source has supplied an identity hint, only that hint may resolve a
  // listing. Falling back to every code in the excerpt would bind an unknown
  // code to a nearby peer. Source-text scanning is used only when the caller
  // has no code hint at all, which normalizeMention currently avoids.
  const rawCandidates = value ? [value, ...extractExplicitCodes(value)] : extractExplicitCodes(sourceText);
  const candidates = uniqueStrings(rawCandidates).map((item) => normalizeSecurityCode(item)).filter((item): item is string => Boolean(item));
  return candidates.find((candidate) => dictionary.byCode.has(candidate)) ?? null;
}

function extractExplicitCodes(value: string) {
  return [...value.matchAll(CODE_WITH_MARKET)].map((match) => match[0].trim());
}

function rawCodeForCode(code: string, sourceText: string) {
  const symbol = code.split('.')[0];
  const match = extractExplicitCodes(sourceText).find((raw) => normalizeSecurityCode(raw) === code);
  if (match) return match;
  const bare = sourceText.match(new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(symbol)}(?![A-Za-z0-9])`, 'i'))?.[0];
  return bare ?? code;
}

function marketForCode(code: string) {
  const suffix = code.split('.').at(-1) ?? '';
  if (suffix === 'HK') return 'HK';
  if (['SS', 'SZ', 'BJ'].includes(suffix)) return 'CN';
  if (['US', 'N', 'O'].includes(suffix)) return 'US';
  if (suffix === 'SI') return 'SG';
  if (suffix === 'TW') return 'TW';
  if (suffix === 'JP') return 'JP';
  if (['KS', 'KQ'].includes(suffix)) return 'KR';
  return 'UNKNOWN';
}

function venueForMarket(market: string) {
  return ({ HK: 'HKEX', CN: 'CN_EXCHANGE', US: 'US_EXCHANGE', SG: 'SGX', TW: 'TWSE', JP: 'JPX', KR: 'KRX' } as Record<string, string>)[market] ?? 'UNKNOWN';
}

function currencyForMarket(market: string) {
  return ({ HK: 'HKD', CN: 'CNY', US: 'USD', SG: 'SGD', TW: 'TWD', JP: 'JPY', KR: 'KRW' } as Record<string, string>)[market] ?? null;
}

function instrumentType(entry: DictionaryEntry): InstrumentType {
  // The A-share sources are stock lists. Other directory entries do not carry
  // an authoritative share-class field, so do not label every instrument equity.
  return /\.(?:SS|SZ|BJ)$/.test(entry.code) ? 'common_equity' : 'unknown';
}

function chooseCanonicalName(names: string[]) {
  const values = uniqueStrings(names).filter((name) => !genericName(name));
  return values.sort((left, right) => {
    const leftChinese = /[\u3400-\u9fff]/.test(left) ? 0 : 1;
    const rightChinese = /[\u3400-\u9fff]/.test(right) ? 0 : 1;
    // Keep dictionary order for equal-length names so the primary entry's
    // source spelling (usually simplified Chinese for A/H pairs) wins without
    // fabricating a preferred translation or script conversion.
    return leftChinese - rightChinese || left.length - right.length;
  })[0] ?? '';
}

function addRawName(entity: OrganizationIdentity | SecurityIdentity, value: string) {
  if (value && !entity.rawNames.includes(value)) entity.rawNames.push(value);
}

function cleanText(value: string) {
  // Keep source spelling intact; matching removes punctuation separately.
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function sourceText(value: string) {
  return value.trim();
}

function nameKey(value: string) {
  return cleanText(value).replace(/[“”"']/g, '').toLowerCase().replace(/\s+/g, '');
}

function genericName(value: string) {
  const name = cleanText(value);
  return !name || name.length < 2 || name.length > 80 || NAME_GENERIC.test(name) || /^(?:评级|目标价|当前价|风险|催化剂|财务|宏观)/.test(name);
}

function shortAlias(value: string) {
  return /^[A-Z]{2,8}$/.test(cleanText(value));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function uniqueSourceStrings(values: string[]) {
  return [...new Set(values.map((value) => sourceText(value)).filter(Boolean))];
}

function stringsFromUnknown(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
