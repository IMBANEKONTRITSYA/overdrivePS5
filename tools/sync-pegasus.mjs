#!/usr/bin/env node
// Refreshes the catalog's download sources from pegasus-dl.dev, the aggregator the catalog was built
// from (every pegasus record carries `source: "pegasus-<n>"`). For each title it replaces the pegasus
// records in app/data/releases/<id>.json with the aggregator's current links, keeps records from other
// sources (orbit, blackbox, archive-discovery) untouched, recomputes each game's `providers`/`direct`
// summary in app/data/catalog.js, and adds a card plus page for a title the catalog does not list yet.
//
//   node tools/sync-pegasus.mjs [--dry-run] [--from <dir>]
//
// --from reads catalogs.json and <slug>.json from a directory instead of the network. Without
// --dry-run the data files are rewritten in place. Nothing in app/state changes: records follow the
// shape the readers expect (see CLAUDE.md, "Данные каталога"), ids of unchanged links are preserved so
// queued downloads keep matching, and a link that disappeared from the aggregator is dropped.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'app/data');
const SITE = 'https://pegasus-dl.dev';
// The catalog numbered the aggregator's catalogs in this order; new slugs continue after them.
const SLUG_INDEX = { dlps: 0, pippo: 1, pfs: 2, zer0: 3 };
const TITLE_ID = /^(?:CUSA|PPSA)\d{5}$/;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const from = args.includes('--from') ? resolve(args[args.indexOf('--from') + 1]) : null;

// --- fetching -----------------------------------------------------------------------------------

async function fetchJSON(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Overdrive catalog sync' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function loadCatalogs() {
  const index = from ? JSON.parse(readFileSync(join(from, 'catalogs.json'), 'utf8')) : await fetchJSON(`${SITE}/api/catalogs`);
  const catalogs = [...index.catalogs].sort((a, b) => a.id - b.id);
  let next = Math.max(-1, ...Object.values(SLUG_INDEX)) + 1;
  const loaded = [];
  for (const catalog of catalogs) {
    const number = SLUG_INDEX[catalog.slug] ?? next++;
    const data = from ? JSON.parse(readFileSync(join(from, `${catalog.slug}.json`), 'utf8')) : await fetchJSON(catalog.sourceUrl);
    const packages = Array.isArray(data) ? data : data.packages ?? Object.values(data).find(Array.isArray);
    if (!Array.isArray(packages) || !packages.length) throw new Error(`${catalog.slug}: no packages; refusing to drop its records`);
    loaded.push({ ...catalog, number, packages });
    console.log(`${catalog.slug}: ${packages.length} packages -> pegasus-${number}`);
  }
  return loaded;
}

// --- record shape -------------------------------------------------------------------------------

const hash = (value, length) => createHash('sha1').update(value).digest('hex').slice(0, length);
const hostOf = (url) => {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};
const isHost = (host, domain) => host === domain || host.endsWith(`.${domain}`);

// Provider spelling as the catalog has used it, and the flow the app's resolver follows. The flow
// mirrors sourceKind() in app/state/download-sources.js.
const KNOWN = [
  { domains: ['vikingfile.com', 'vik1ngfile.site'], provider: 'VikingFile', flow: 'vikingfile' },
  { domains: ['mediafire.com'], provider: 'MediaFire', flow: 'mediafire' },
  { domains: ['buzzheavier.com', 'fuckingfast.net'], provider: 'Buzzheavier', flow: 'buzzheavier' },
  { domains: ['datanodes.to', 'datanodes.co'], provider: 'DataNodes', flow: 'datanodes' },
  { domains: ['akirabox.com', 'akirabox.to'], provider: 'AkiraBox', flow: 'akirabox' },
  { domains: ['archive.org'], provider: 'archive.org', flow: null },
  { domains: ['github.com'], provider: 'github.com', flow: null }
];
const DIRECT_FILE = /\.(?:ffpfsc|ffpfs|ffpkg|exfat|pkg|zip|rar|7z)(?:[?#]|$)/i;
function classify(url) {
  const host = hostOf(url);
  if (!host) return null;
  const path = new URL(url).pathname;
  const known = KNOWN.find((item) => item.domains.some((domain) => isHost(host, domain)));
  const direct = host === 'archive.org' && path.startsWith('/download/') || host === 'github.com' && path.includes('/releases/download/') || DIRECT_FILE.test(path);
  const flow = known?.flow ?? (direct ? 'direct' : 'browser');
  return { provider: known?.provider ?? (host === 'rootz.so' ? 'www.rootz.so' : host), flow: flow === null ? (direct ? 'direct' : 'browser') : flow };
}
const formatOf = (url, flow) => flow === 'direct' && DIRECT_FILE.exec(new URL(url).pathname)?.[0].replace(/[?#].*$/, '').slice(1).toLowerCase() || 'binary';

// The label as the catalog has written it: the aggregator's link name, with the volume spelled
// "part N" (the app groups volumes by that), FuckingFast named after its current host, and the
// catalog's own "<format> · " prefix dropped.
function labelOf(name, host) {
  let label = String(name || '').replace(/^[^·]*·\s*/, '').trim();
  label = label.replace(/\bpt\.?\s*(\d+)\b/i, 'part $1').replace(/\bpart\s*(\d+)\b/i, 'part $1');
  if (host && isHost(host, 'buzzheavier.com')) label = label.replace(/\bFuckingFast\b/gi, 'BuzzHeavier');
  return label;
}
const volumeOf = (label) => /\bpart\s*(\d+)\b/i.exec(label)?.[0].toLowerCase().replace(/\s+/, ' ') ?? null;
const passwordOf = (description) => /^\s*Password\s*:\s*(.+?)\s*$/im.exec(String(description || '').replace(/<[^>]+>/g, '\n'))?.[1] ?? null;
const versionOf = (pkg) => {
  if (pkg.version) return String(pkg.version).trim();
  const tagged = /\bTags\s*:[^\n]*?\b(v?\d{2}\.\d{3}(?:\.\d{3})?)\b/i.exec(pkg.description || '');
  return tagged ? tagged[1] : '';
};
const textOf = (html) => String(html || '').replace(/<\/p>\s*<p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, ' ');

// Records of one aggregator package, in link order.
function recordsOf(pkg, catalog, existing, ordinal) {
  const titleId = String(pkg.titleId || '').toUpperCase();
  const version = versionOf(pkg);
  const category = pkg.category === 'dlc' ? 'dlc' : 'game';
  const password = passwordOf(pkg.description);
  // One record per package: the app groups a set's volumes by it, so two packages of the same title
  // (a catalog lists some twice) must not share one, or their "part 1"s read as duplicates.
  const record = `pegasus-${catalog.number}-${hash(`${catalog.slug}/${titleId}/${pkg.createdAt || ''}/${version}/${ordinal}`, 8)}`;
  const out = [];
  // A package sometimes lists two sets with the same name on the same host (two regions, say). The
  // app groups volumes by host and label, so the second set and onwards get a numbered label.
  const sequences = new Map();
  for (const link of pkg.downloadLinks || []) {
    const url = String(link.url || '').trim();
    const kind = classify(url);
    if (!kind || !/^https?:\/\//i.test(url)) continue;
    let label = labelOf(link.name, hostOf(url));
    const volume = volumeOf(label);
    if (volume) {
      const base = label.replace(/\s*\bpart\s*\d+\b/i, '').trim();
      const key = `${tokenOf(kind.provider)}/${base.toLowerCase()}`;
      const number = Number(/\d+/.exec(volume)[0]);
      // Each volume joins the first set of its name that still lacks its number, so a stray repeated
      // "part 1" ends up alone instead of splitting a complete set in two.
      const sets = sequences.get(key) ?? sequences.set(key, []).get(key);
      let slot = sets.findIndex((set) => !set.has(number));
      if (slot < 0) slot = sets.push(new Set()) - 1;
      sets[slot].add(number);
      if (slot > 0) label = `${base} (${slot + 1}) ${volume}`;
    }
    const old = existing.get(url);
    const id = old?.id ?? `r${hash(url, 12)}`;
    const format = formatOf(url, kind.flow);
    const item = {
      id,
      format,
      filename: `${titleId}-${category}-${version || 'unknown'}-${id}.${format}`,
      url,
      ...kind.flow !== 'direct' && { browserUrl: url },
      requiresBrowser: kind.flow !== 'direct',
      sizeBytes: volume ? null : pkg.sizeBytes || null,
      version,
      category,
      provider: kind.provider,
      source: `pegasus-${catalog.number}`,
      flow: kind.flow,
      label,
      ...volume && { volume },
      ...password && { archivePassword: password },
      record
    };
    // What the catalog learned about this exact link stays: a dead Archive.org item stays dead.
    for (const key of ['platform', 'health', 'sha256', 'unavailableReason']) if (old?.[key] !== undefined) item[key] = old[key];
    out.push(item);
  }
  return { titleId, records: out, version, category };
}

// --- catalog.js ---------------------------------------------------------------------------------

const escape = (text) => JSON.stringify(text).replace(/[\u007f-￿]/g, (c) => {
  const n = c.charCodeAt(0);
  return n <= 255 ? `\\x${n.toString(16).toUpperCase().padStart(2, '0')}` : `\\u${n.toString(16).toUpperCase().padStart(4, '0')}`;
});
const serialize = (value) => Array.isArray(value) ? `[${value.map(serialize).join(', ')}]` : value && typeof value === 'object' ? `{ ${Object.entries(value).map(([k, v]) => `${escape(k)}: ${serialize(v)}`).join(', ')} }` : typeof value === 'string' ? escape(value) : JSON.stringify(value);
const ARRAY = (name) => new RegExp(`(  var ${name} = \\[\\n)([\\s\\S]*?)(\\n  \\];)`);

function readCatalog() {
  const text = readFileSync(join(DATA, 'catalog.js'), 'utf8');
  const parse = (name) => (0, eval)(`[${ARRAY(name).exec(text)[2]}\n]`);
  const games = parse('games'), twins = parse('twins');
  // The serializer must reproduce the file byte for byte before it is trusted to rewrite it.
  for (const [name, list] of [['games', games], ['twins', twins]]) {
    const lines = ARRAY(name).exec(text)[2].split('\n').map((line) => line.replace(/^    /, '').replace(/,$/, ''));
    list.forEach((item, i) => {
      if (serialize(item) !== lines[i]) throw new Error(`catalog.js ${name}[${i}] would not round-trip; serializer out of date`);
    });
  }
  return { text, games, twins };
}
const writeCatalog = (catalog, games, twins) => {
  let text = catalog.text;
  for (const [name, list] of [['games', games], ['twins', twins]]) text = text.replace(ARRAY(name), (_, open, __, close) => `${open}${list.map((item) => `    ${serialize(item)}`).join(',\n')}${close}`);
  return text;
};

// The provider token a game lists for a record, as the catalog has spelled them.
const TOKENS = { VikingFile: 'vikingfile', Vikingfile: 'vikingfile', MediaFire: 'mediafire', Buzzheavier: 'buzzheavier', DataNodes: 'datanodes', AkiraBox: 'akirabox', 'archive.org': 'archive.org', 'Archive.org': 'archive.org', 'link-vault.org': 'link-vault.org', 'github.com': 'github', 'www.rootz.so': 'rootz', 'Overdrive CDN': 'overdrive cdn' };
const tokenOf = (provider) => TOKENS[provider] ?? provider.toLowerCase().replace(/^www\./, '').replace(/\.[a-z]+$/, '');
const SELF_RESOLVING = new Set(['direct', 'mediafire', 'buzzheavier']);
function summarize(game, records) {
  const live = records.filter((item) => !item.unavailableReason);
  const providers = [...new Set(live.map((item) => tokenOf(item.provider)))].sort();
  const direct = live.some((item) => SELF_RESOLVING.has(item.flow));
  const next = {};
  for (const [key, value] of Object.entries(game)) {
    if (key === 'providers') next.providers = providers;
    else if (key === 'direct') {
      if (direct) next.direct = true;
    } else {
      if (key === 'developer' && direct && !('direct' in game)) next.direct = true;
      next[key] = value;
    }
  }
  if (!('providers' in next)) next.providers = providers;
  return next;
}

function newGame(titleId, pkg, records) {
  const game = {
    id: titleId,
    title: String(pkg.title || titleId).trim(),
    platform: titleId.startsWith('CUSA') ? 'ps4' : 'ps5',
    providers: [],
    developer: '',
    publisher: '',
    releaseDate: '',
    genres: [],
    features: [],
    recommendations: 0,
    ...pkg.sizeBytes && { sizeGb: Math.round(pkg.sizeBytes / 1e9 * 1000) / 1000 },
    art: { cover: pkg.posterUrl || pkg.originalPosterUrl || null, ...pkg.originalPosterUrl && pkg.posterUrl && pkg.originalPosterUrl !== pkg.posterUrl && { coverFallbacks: [pkg.originalPosterUrl] }, tint: '#2a2a2f' }
  };
  return summarize(game, records);
}
const newPage = (pkg) => {
  const about = textOf(pkg.description).split('\n').map((line) => line.trim()).filter(Boolean);
  return { about, shots: [], summary: '' };
};

// --- main -----------------------------------------------------------------------------------

const releasesDir = join(DATA, 'releases');
const pagesDir = join(DATA, 'pages');
const catalogs = await loadCatalogs();
const catalog = readCatalog();
const byId = new Map([...catalog.games, ...catalog.twins].map((game) => [game.id, game]));

// Current records, by title and by URL, so ids and learned facts survive the refresh.
const current = new Map();
const existing = new Map();
for (const file of readdirSync(releasesDir)) {
  if (!file.endsWith('.json')) continue;
  const records = JSON.parse(readFileSync(join(releasesDir, file), 'utf8'));
  current.set(file.slice(0, -5), records);
  for (const item of records) if (item.url && !existing.has(item.url)) existing.set(item.url, item);
}

// Fresh pegasus records per title, in catalog then package order.
const fresh = new Map();
const firstPackage = new Map();
let packages = 0, skipped = 0;
for (const item of catalogs) {
  const seen = new Map();
  for (const pkg of item.packages) {
    const key = String(pkg.titleId || '').toUpperCase();
    const ordinal = seen.get(key) ?? 0;
    seen.set(key, ordinal + 1);
    const { titleId, records } = recordsOf(pkg, item, existing, ordinal);
    if (!TITLE_ID.test(titleId)) {
      skipped++;
      continue;
    }
    packages++;
    fresh.set(titleId, [...fresh.get(titleId) ?? [], ...records]);
    if (!firstPackage.has(titleId)) firstPackage.set(titleId, pkg);
  }
}
console.log(`${packages} packages for ${fresh.size} titles (${skipped} without a title id skipped)`);

const stats = { titles: 0, changed: 0, added: 0, removed: 0, kept: 0, newGames: 0, gainedAuto: 0, lostAll: 0, verified: 0 };
const classOf = (records) => {
  const live = records.filter((item) => !item.unavailableReason);
  if (live.some((item) => SELF_RESOLVING.has(item.flow))) return 'auto';
  if (live.some((item) => item.flow === 'vikingfile')) return 'capture';
  return live.length ? 'manual' : 'none';
};
const writes = [];
const titles = new Set([...current.keys(), ...fresh.keys()]);
const games = catalog.games.slice(), twins = catalog.twins.slice();
for (const titleId of [...titles].sort()) {
  const before = current.get(titleId) ?? [];
  const others = before.filter((item) => !/^pegasus-/.test(item.source || ''));
  const pegasus = fresh.get(titleId) ?? [];
  // A link the aggregator no longer lists goes, with one exception: a direct download the catalog
  // had verified (Archive.org and GitHub files with a health record, not marked unavailable) stays,
  // since nothing says it stopped working and no host page stands between the app and the file.
  const listed = new Set(pegasus.map((item) => item.url));
  const verified = before.filter((item) => /^pegasus-/.test(item.source || '') && !listed.has(item.url) && item.flow === 'direct' && item.health && !item.unavailableReason);
  stats.verified += verified.length;
  const after = [...others, ...verified, ...pegasus];
  const beforeUrls = new Set(before.map((item) => item.url)), afterUrls = new Set(after.map((item) => item.url));
  stats.titles++;
  stats.added += [...afterUrls].filter((url) => !beforeUrls.has(url)).length;
  stats.removed += [...beforeUrls].filter((url) => !afterUrls.has(url)).length;
  const text = JSON.stringify(after);
  if (text !== JSON.stringify(before)) {
    stats.changed++;
    writes.push([join(releasesDir, `${titleId}.json`), text]);
  } else stats.kept++;
  const was = classOf(before), now = classOf(after);
  if (was !== 'auto' && now === 'auto' || was === 'manual' && now === 'capture') stats.gainedAuto++;
  if (was !== 'none' && now === 'none') stats.lostAll++;
  const game = byId.get(titleId);
  if (game) {
    const list = games.includes(game) ? games : twins;
    list[list.indexOf(game)] = summarize(game, after);
  } else if (pegasus.length) {
    const pkg = firstPackage.get(titleId);
    games.push(newGame(titleId, pkg, after));
    stats.newGames++;
    if (!existsSync(join(pagesDir, `${titleId}.json`))) writes.push([join(pagesDir, `${titleId}.json`), JSON.stringify(newPage(pkg))]);
  }
}
const catalogText = writeCatalog(catalog, games, twins);
if (catalogText !== catalog.text) writes.push([join(DATA, 'catalog.js'), catalogText]);

console.log(`titles: ${stats.titles}; release files changed: ${stats.changed}, unchanged: ${stats.kept}; links added: ${stats.added}, dropped: ${stats.removed}`);
console.log(`new game cards: ${stats.newGames}; titles that gained an automatic or capturable source: ${stats.gainedAuto}; titles left with no source: ${stats.lostAll}; verified direct links kept though unlisted: ${stats.verified}`);
const classes = { auto: 0, capture: 0, manual: 0, none: 0 };
for (const titleId of titles) classes[classOf(JSON.parse(writes.find(([path]) => path.endsWith(`/releases/${titleId}.json`))?.[1] ?? JSON.stringify(current.get(titleId) ?? [])))]++;
console.log(`after sync: auto ${classes.auto}, capture ${classes.capture}, manual only ${classes.manual}, none ${classes.none}`);
if (dryRun) {
  console.log(`dry run: ${writes.length} files would be written`);
} else {
  mkdirSync(pagesDir, { recursive: true });
  for (const [path, text] of writes) writeFileSync(path, text);
  console.log(`${writes.length} files written`);
}
