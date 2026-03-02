#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLAUDE_PROJECTS = process.env.CLAUDE_PROJECTS || path.join(os.homedir(), '.claude', 'projects');
const PORT = Number(process.env.PORT || 47831);
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');
const SESSION_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACT_NAME_RE = /agent-acompact-/i;
const CUSTOM_META_PATH = path.join(CLAUDE_PROJECTS, '.session-web-manager.meta.json');

const sessionMetaCache = new Map();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

function normalizeText(input) {
  return String(input || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isPathUnder(root, target) {
  const relative = path.relative(root, target);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value
      .map((x) => normalizeText(x))
      .filter(Boolean)
      .slice(0, 32);
  }

  const raw = normalizeText(value);
  if (!raw) {
    return [];
  }

  return raw.split(/[,\n，]/)
    .map((x) => normalizeText(x))
    .filter(Boolean)
    .slice(0, 32);
}

function readCustomMetaStore() {
  const raw = readJsonSafe(CUSTOM_META_PATH);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1, entries: {} };
  }

  const entries = raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries)
    ? raw.entries
    : {};

  return {
    ...raw,
    version: Number(raw.version || 1),
    entries,
  };
}

function writeCustomMetaStore(store) {
  const next = {
    version: 1,
    entries: {},
    ...store,
  };
  writeJsonAtomic(CUSTOM_META_PATH, next);
}

function getCustomMetaForPath(fullPath, store = null) {
  const s = store || readCustomMetaStore();
  const item = s.entries?.[fullPath];
  if (!item || typeof item !== 'object') {
    return { name: '', tags: [] };
  }
  return {
    name: normalizeText(item.name),
    tags: normalizeTags(item.tags),
  };
}

function setCustomMetaForPath(fullPath, { name, tags }) {
  const store = readCustomMetaStore();
  const nextName = normalizeText(name);
  const nextTags = normalizeTags(tags);

  if (!nextName && nextTags.length === 0) {
    delete store.entries[fullPath];
    writeCustomMetaStore(store);
    return { name: '', tags: [] };
  }

  store.entries[fullPath] = {
    name: nextName,
    tags: nextTags,
    updatedAt: new Date().toISOString(),
  };
  writeCustomMetaStore(store);
  return { name: nextName, tags: nextTags };
}

function parseTimeSafe(value) {
  const t = Date.parse(String(value || ''));
  return Number.isFinite(t) ? t : null;
}

function isValidSessionId(value) {
  return SESSION_ID_RE.test(String(value || ''));
}

function listProjectDirs() {
  if (!fs.existsSync(CLAUDE_PROJECTS)) {
    return [];
  }
  return fs.readdirSync(CLAUDE_PROJECTS, { withFileTypes: true }).filter((d) => d.isDirectory());
}

function safeRelative(root, target) {
  const rel = path.relative(root, target);
  return rel.startsWith('..') ? target : rel || '.';
}

function extractUserText(content) {
  if (typeof content === 'string') {
    return normalizeText(content);
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const parts = [];
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item);
      continue;
    }

    if (!item || typeof item !== 'object') {
      continue;
    }

    // Skip tool_result payloads and other non-user authored blobs.
    if (item.type === 'tool_result' || item.tool_use_id) {
      continue;
    }

    if (item.type === 'text' && typeof item.text === 'string') {
      parts.push(item.text);
      continue;
    }

    if (typeof item.text === 'string' && !item.type) {
      parts.push(item.text);
      continue;
    }

    if (typeof item.content === 'string' && !item.type) {
      parts.push(item.content);
    }
  }

  return normalizeText(parts.join(' '));
}

function extractAssistantText(content) {
  if (typeof content === 'string') {
    return normalizeText(content);
  }

  if (!Array.isArray(content)) {
    return '';
  }

  for (const item of content) {
    if (typeof item === 'string') {
      const text = normalizeText(item);
      if (text) return text;
      continue;
    }

    if (!item || typeof item !== 'object') {
      continue;
    }

    if (typeof item.text === 'string') {
      const text = normalizeText(item.text);
      if (text) return text;
      continue;
    }

    if (typeof item.content === 'string') {
      const text = normalizeText(item.content);
      if (text) return text;
    }
  }

  return '';
}

function extractTimelineText(content) {
  if (typeof content === 'string') {
    return normalizeText(content);
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const parts = [];
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item);
      continue;
    }

    if (!item || typeof item !== 'object') {
      continue;
    }

    if (item.type === 'tool_result' || item.type === 'thinking' || item.tool_use_id) {
      continue;
    }

    if (item.type === 'text' && typeof item.text === 'string') {
      parts.push(item.text);
      continue;
    }

    if (!item.type && typeof item.text === 'string') {
      parts.push(item.text);
      continue;
    }

    if (!item.type && typeof item.content === 'string') {
      parts.push(item.content);
    }
  }

  return normalizeText(parts.join(' '));
}

function detectCompactSignal({ filePath, text, obj, sourceKind }) {
  if (sourceKind === 'compact') {
    return true;
  }

  const base = path.basename(filePath);
  if (COMPACT_NAME_RE.test(base)) {
    return true;
  }

  const agentId = normalizeText(obj?.agentId);
  if (COMPACT_NAME_RE.test(agentId)) {
    return true;
  }
  return false;
}

function parseRecoveryEventsFromFile(filePath, sourceKind) {
  const lines = readJsonLines(filePath);
  const events = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    const type = normalizeText(obj?.type);
    const tsRaw = normalizeText(obj?.timestamp || obj?.message?.timestamp);
    const tsMs = parseTimeSafe(tsRaw);
    const role = type === 'user' || type === 'assistant' ? type : 'system';

    let text = '';
    if (type === 'user' || type === 'assistant') {
      text = extractTimelineText(obj?.message?.content);
    } else if (type === 'system') {
      text = normalizeText(obj?.message || obj?.summary || obj?.subtype || '');
    }

    const isCompactSignal = detectCompactSignal({ filePath, text, obj, sourceKind });
    if (!text && !isCompactSignal) {
      continue;
    }

    events.push({
      lineNo: i + 1,
      timestamp: tsRaw || '',
      tsMs,
      role,
      type,
      text,
      sourceKind,
      sourceFile: filePath,
      isCompactSignal,
    });
  }

  return events;
}

function findSessionMainFiles(sessionId) {
  if (!isValidSessionId(sessionId)) {
    return [];
  }

  const result = [];
  for (const dir of listProjectDirs()) {
    const candidate = path.join(CLAUDE_PROJECTS, dir.name, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate) && isPathUnder(CLAUDE_PROJECTS, candidate)) {
      result.push(candidate);
    }
  }
  return result;
}

function chooseNewestFile(paths) {
  let best = null;
  let bestTs = -1;
  for (const p of paths) {
    try {
      const ts = fs.statSync(p).mtimeMs;
      if (ts > bestTs) {
        bestTs = ts;
        best = p;
      }
    } catch {
      // ignore
    }
  }
  return best;
}

function buildRecoverySession(sessionId, includeSubagents = true) {
  const candidates = findSessionMainFiles(sessionId);
  if (candidates.length === 0) {
    return null;
  }

  const mainFile = chooseNewestFile(candidates);
  if (!mainFile) {
    return null;
  }

  const projectDir = path.dirname(mainFile);
  const sessionDir = path.join(projectDir, sessionId);
  const subagentDir = path.join(sessionDir, 'subagents');

  const events = [];
  const mainEvents = parseRecoveryEventsFromFile(mainFile, 'main');
  events.push(...mainEvents);

  let subagentFiles = [];
  let compactFiles = [];

  if (includeSubagents && fs.existsSync(subagentDir)) {
    subagentFiles = fs.readdirSync(subagentDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.jsonl'))
      .map((d) => path.join(subagentDir, d.name));

    compactFiles = subagentFiles.filter((p) => COMPACT_NAME_RE.test(path.basename(p)));

    for (const filePath of subagentFiles) {
      const kind = COMPACT_NAME_RE.test(path.basename(filePath)) ? 'compact' : 'subagent';
      events.push(...parseRecoveryEventsFromFile(filePath, kind));
    }
  }

  // Keep stable ordering for same timestamps.
  events.forEach((e, idx) => {
    e._seq = idx;
  });

  events.sort((a, b) => {
    if (a.tsMs !== null && b.tsMs !== null && a.tsMs !== b.tsMs) {
      return a.tsMs - b.tsMs;
    }
    if (a.tsMs !== null && b.tsMs === null) return -1;
    if (a.tsMs === null && b.tsMs !== null) return 1;
    return a._seq - b._seq;
  });

  let firstCompactIndex = -1;
  let firstCompactAt = '';
  for (let i = 0; i < events.length; i += 1) {
    if (events[i].isCompactSignal) {
      firstCompactIndex = i;
      firstCompactAt = events[i].timestamp || '';
      break;
    }
  }

  const normalized = events.map((e, idx) => ({
    id: idx + 1,
    timestamp: e.timestamp,
    role: e.role,
    type: e.type,
    text: e.text,
    sourceKind: e.sourceKind,
    sourceFile: safeRelative(projectDir, e.sourceFile),
    lineNo: e.lineNo,
    isCompactSignal: e.isCompactSignal,
    isPreCompact: firstCompactIndex === -1 ? true : idx < firstCompactIndex,
  }));

  const preCompactCount = normalized.filter((e) => e.isPreCompact).length;

  return {
    sessionId,
    projectDir,
    mainFile: safeRelative(projectDir, mainFile),
    subagentDir: fs.existsSync(subagentDir) ? safeRelative(projectDir, subagentDir) : '',
    candidates: candidates.map((p) => safeRelative(projectDir, p)),
    stats: {
      totalEvents: normalized.length,
      preCompactCount,
      compactSignalCount: normalized.filter((e) => e.isCompactSignal).length,
      firstCompactAt,
      subagentFiles: subagentFiles.length,
      compactFiles: compactFiles.length,
    },
    events: normalized,
  };
}

function readJsonLines(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function fileTimeToIso(ms) {
  if (!Number.isFinite(ms)) {
    return '';
  }
  return new Date(ms).toISOString();
}

function getFileCacheKey(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return `${filePath}|${stat.mtimeMs}|${stat.size}`;
  } catch {
    return `${filePath}|missing`;
  }
}

function getSessionMeta(filePath) {
  const cacheKey = getFileCacheKey(filePath);
  if (sessionMetaCache.has(cacheKey)) {
    return sessionMetaCache.get(cacheKey);
  }

  let firstPrompt = '';
  let lastPrompt = '';
  let summary = '';
  let projectPath = '';
  let messageCount = 0;
  let createdMs = null;
  let modifiedMs = null;
  let fallbackFirstPrompt = '';
  let fallbackLastPrompt = '';
  let fallbackLastPromptTs = '';
  const recentUserPrompts = [];

  const lines = readJsonLines(filePath);
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    const ts = parseTimeSafe(obj?.timestamp);
    if (ts !== null) {
      createdMs = createdMs === null ? ts : Math.min(createdMs, ts);
      modifiedMs = modifiedMs === null ? ts : Math.max(modifiedMs, ts);
    }

    if (!projectPath) {
      const cwd = normalizeText(obj?.cwd);
      if (cwd) {
        projectPath = cwd;
      }
    }

    if (obj?.type === 'queue-operation' && obj?.operation === 'enqueue') {
      const qText = normalizeText(obj?.content);
      if (qText) {
        if (!fallbackFirstPrompt) {
          fallbackFirstPrompt = qText;
        }
        fallbackLastPrompt = qText;
        fallbackLastPromptTs = normalizeText(obj?.timestamp);
      }
      continue;
    }

    if (obj?.type === 'user') {
      if (obj?.isMeta) {
        continue;
      }

      const text = extractUserText(obj?.message?.content);
      if (text) {
        messageCount += 1;
        if (!firstPrompt) {
          firstPrompt = text;
        }
        lastPrompt = text;
        recentUserPrompts.push({
          text,
          timestamp: normalizeText(obj?.timestamp),
        });
        if (recentUserPrompts.length > 30) {
          recentUserPrompts.shift();
        }
      }
      continue;
    }

    if (obj?.type === 'assistant') {
      messageCount += 1;
      if (!summary) {
        const text = extractAssistantText(obj?.message?.content);
        if (text) {
          summary = text;
        }
      }
    }
  }

  if (!firstPrompt && fallbackFirstPrompt) {
    firstPrompt = fallbackFirstPrompt;
  }
  if (!lastPrompt && fallbackLastPrompt) {
    lastPrompt = fallbackLastPrompt;
  }
  if (recentUserPrompts.length === 0 && fallbackLastPrompt) {
    recentUserPrompts.push({
      text: fallbackLastPrompt,
      timestamp: fallbackLastPromptTs,
    });
  }

  try {
    const stat = fs.statSync(filePath);
    if (modifiedMs === null) {
      modifiedMs = stat.mtimeMs;
    }
    if (createdMs === null) {
      createdMs = stat.birthtimeMs || stat.ctimeMs || stat.mtimeMs;
    }
  } catch {
    // ignore
  }

  const meta = {
    firstPrompt,
    lastPrompt,
    summary: summary || firstPrompt || lastPrompt,
    projectPath,
    messageCount,
    created: fileTimeToIso(createdMs),
    modified: fileTimeToIso(modifiedMs),
    recentUserPrompts,
  };

  sessionMetaCache.set(cacheKey, meta);
  return meta;
}

function loadIndexEntriesByFullPath() {
  const map = new Map();
  if (!fs.existsSync(CLAUDE_PROJECTS)) {
    return map;
  }

  const projectDirs = fs.readdirSync(CLAUDE_PROJECTS, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const dir of projectDirs) {
    const indexPath = path.join(CLAUDE_PROJECTS, dir.name, 'sessions-index.json');
    if (!fs.existsSync(indexPath)) {
      continue;
    }

    const indexData = readJsonSafe(indexPath);
    if (!indexData || !Array.isArray(indexData.entries)) {
      continue;
    }

    for (const entry of indexData.entries) {
      const fullPath = normalizeText(entry?.fullPath);
      const sessionId = normalizeText(entry?.sessionId);
      if (!fullPath || !sessionId) {
        continue;
      }

      if (!isPathUnder(CLAUDE_PROJECTS, fullPath)) {
        continue;
      }

      map.set(fullPath, {
        indexPath,
        sessionId,
        projectPath: normalizeText(entry?.projectPath),
        summary: normalizeText(entry?.summary),
        firstPrompt: normalizeText(entry?.firstPrompt),
        messageCount: Number(entry?.messageCount || 0),
        created: normalizeText(entry?.created),
        modified: normalizeText(entry?.modified),
      });
    }
  }

  return map;
}

function collectMainSessionFiles(indexByPath = null) {
  if (!fs.existsSync(CLAUDE_PROJECTS)) {
    return [];
  }

  const indexMap = indexByPath || loadIndexEntriesByFullPath();
  const projectDirs = listProjectDirs();
  const files = [];

  for (const dir of projectDirs) {
    const projectDir = path.join(CLAUDE_PROJECTS, dir.name);
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });

    for (const file of entries) {
      if (!file.isFile() || !SESSION_FILE_RE.test(file.name)) {
        continue;
      }

      const fullPath = path.join(projectDir, file.name);
      if (!isPathUnder(CLAUDE_PROJECTS, fullPath)) {
        continue;
      }

      const sessionId = file.name.replace(/\.jsonl$/i, '');
      const indexMeta = indexMap.get(fullPath) || null;
      files.push({
        projectDir,
        fullPath,
        sessionId,
        indexPath: indexMeta?.indexPath || '',
      });
    }
  }

  return files;
}

function tryReadStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function readSessionBranchAndSidechain(filePath) {
  const lines = readJsonLines(filePath);
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    const branch = normalizeText(obj?.gitBranch);
    const sidechain = typeof obj?.isSidechain === 'boolean' ? obj.isSidechain : null;
    if (branch || sidechain !== null) {
      return {
        gitBranch: branch,
        isSidechain: sidechain === true,
      };
    }
  }

  return {
    gitBranch: '',
    isSidechain: false,
  };
}

function listSessionRecords() {
  if (!fs.existsSync(CLAUDE_PROJECTS)) {
    return [];
  }

  const indexByPath = loadIndexEntriesByFullPath();
  const customMetaStore = readCustomMetaStore();
  const mainFiles = collectMainSessionFiles(indexByPath);
  const records = [];

  for (const file of mainFiles) {
    const fileMeta = getSessionMeta(file.fullPath);
    const indexMeta = indexByPath.get(file.fullPath) || null;
    const customMeta = getCustomMetaForPath(file.fullPath, customMetaStore);

    const keyPayload = {
      sessionId: file.sessionId,
      fullPath: file.fullPath,
      indexPath: file.indexPath || '',
    };

    records.push({
      key: Buffer.from(JSON.stringify(keyPayload), 'utf8').toString('base64url'),
      sessionId: file.sessionId,
      projectPath: indexMeta?.projectPath || fileMeta.projectPath || '',
      modified: indexMeta?.modified || fileMeta.modified || '',
      created: indexMeta?.created || fileMeta.created || '',
      messageCount: indexMeta?.messageCount || fileMeta.messageCount || 0,
      summary: indexMeta?.summary || fileMeta.summary || '',
      firstPrompt: fileMeta.firstPrompt || indexMeta?.firstPrompt || '',
      lastPrompt: fileMeta.lastPrompt || '',
      customName: customMeta.name,
      customTags: customMeta.tags,
    });
  }

  records.sort((a, b) => {
    const bt = parseTimeSafe(b.modified || b.created) || 0;
    const at = parseTimeSafe(a.modified || a.created) || 0;
    return bt - at;
  });

  return records;
}

function decodeKey(rawKey) {
  try {
    const decoded = Buffer.from(String(rawKey || ''), 'base64url').toString('utf8');
    const obj = JSON.parse(decoded);

    const sessionId = normalizeText(obj?.sessionId);
    const fullPath = normalizeText(obj?.fullPath);
    const indexPath = normalizeText(obj?.indexPath);

    if (!sessionId || !fullPath) {
      return null;
    }

    if (!SESSION_FILE_RE.test(`${sessionId}.jsonl`)) {
      return null;
    }

    if (!isPathUnder(CLAUDE_PROJECTS, fullPath)) {
      return null;
    }

    if (indexPath && !isPathUnder(CLAUDE_PROJECTS, indexPath)) {
      return null;
    }

    return {
      sessionId,
      fullPath,
      indexPath: indexPath || '',
    };
  } catch {
    return null;
  }
}

function ensureTrashCommand() {
  const probe = spawnSync('which', ['trash'], { encoding: 'utf8' });
  return probe.status === 0;
}

function writeJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function deleteSessions(keys) {
  if (!ensureTrashCommand()) {
    return {
      ok: false,
      message: '系统未找到 trash 命令，无法安全删除。',
      deleted: 0,
      failed: keys.length,
      details: [],
    };
  }

  const grouped = new Map();
  const details = [];

  for (const rawKey of keys) {
    const meta = decodeKey(rawKey);
    if (!meta) {
      details.push({ key: rawKey, ok: false, reason: '无效 key' });
      continue;
    }

    if (fs.existsSync(meta.fullPath)) {
      const moved = spawnSync('trash', [meta.fullPath], { encoding: 'utf8' });
      if (moved.status !== 0) {
        details.push({ key: rawKey, ok: false, reason: moved.stderr || 'trash 失败' });
        continue;
      }
    }

    if (meta.indexPath) {
      if (!grouped.has(meta.indexPath)) {
        grouped.set(meta.indexPath, new Set());
      }
      grouped.get(meta.indexPath).add(meta.sessionId);
    }

    details.push({ key: rawKey, ok: true, reason: '' });
  }

  for (const [indexPath, sidSet] of grouped.entries()) {
    const data = readJsonSafe(indexPath);
    if (!data || !Array.isArray(data.entries)) {
      continue;
    }

    data.entries = data.entries.filter((entry) => !sidSet.has(normalizeText(entry?.sessionId)));
    writeJsonAtomic(indexPath, data);
  }

  sessionMetaCache.clear();

  const deleted = details.filter((d) => d.ok).length;
  const failed = details.length - deleted;
  return {
    ok: failed === 0,
    message: failed === 0 ? '删除完成。' : '部分删除失败，请看 details。',
    deleted,
    failed,
    details,
  };
}

function buildIndexEntryForFile(filePath, sessionId, existingEntry = null) {
  const stat = tryReadStat(filePath);
  const fileMeta = getSessionMeta(filePath);
  const branchMeta = readSessionBranchAndSidechain(filePath);

  const created = fileMeta.created
    || normalizeText(existingEntry?.created)
    || fileTimeToIso(stat?.birthtimeMs || stat?.ctimeMs || stat?.mtimeMs);

  const modified = fileMeta.modified
    || normalizeText(existingEntry?.modified)
    || fileTimeToIso(stat?.mtimeMs);

  return {
    ...(existingEntry && typeof existingEntry === 'object' ? existingEntry : {}),
    sessionId,
    fullPath: filePath,
    fileMtime: Number(Math.round(stat?.mtimeMs || 0)),
    firstPrompt: fileMeta.firstPrompt || normalizeText(existingEntry?.firstPrompt) || 'No prompt',
    summary: fileMeta.summary || normalizeText(existingEntry?.summary) || 'No summary',
    messageCount: Number(fileMeta.messageCount || existingEntry?.messageCount || 0),
    created,
    modified,
    gitBranch: branchMeta.gitBranch || normalizeText(existingEntry?.gitBranch),
    projectPath: fileMeta.projectPath || normalizeText(existingEntry?.projectPath),
    isSidechain: Boolean(branchMeta.isSidechain || existingEntry?.isSidechain),
  };
}

function rebuildSessionIndexes({ dryRun = false } = {}) {
  if (!fs.existsSync(CLAUDE_PROJECTS)) {
    return {
      ok: true,
      dryRun,
      projects: 0,
      sessions: 0,
      written: 0,
      skipped: 0,
    };
  }

  const projectDirs = listProjectDirs();
  let totalSessions = 0;
  let written = 0;
  let skipped = 0;
  const details = [];

  for (const dir of projectDirs) {
    const projectDir = path.join(CLAUDE_PROJECTS, dir.name);
    const indexPath = path.join(projectDir, 'sessions-index.json');
    const existing = readJsonSafe(indexPath);
    const existingEntries = Array.isArray(existing?.entries) ? existing.entries : [];
    const existingByFullPath = new Map();
    for (const entry of existingEntries) {
      const fp = normalizeText(entry?.fullPath);
      if (fp) existingByFullPath.set(fp, entry);
    }

    const files = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter((f) => f.isFile() && SESSION_FILE_RE.test(f.name))
      .map((f) => path.join(projectDir, f.name));

    const entries = [];
    for (const fullPath of files) {
      const sessionId = path.basename(fullPath).replace(/\.jsonl$/i, '');
      const existingEntry = existingByFullPath.get(fullPath) || null;
      const entry = buildIndexEntryForFile(fullPath, sessionId, existingEntry);
      entries.push(entry);
    }

    entries.sort((a, b) => {
      const bt = parseTimeSafe(b.modified || b.created) || 0;
      const at = parseTimeSafe(a.modified || a.created) || 0;
      return bt - at;
    });

    totalSessions += entries.length;

    const nextIndex = {
      ...(existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}),
      version: Number(existing?.version || 1),
      entries,
    };

    if (!dryRun) {
      writeJsonAtomic(indexPath, nextIndex);
      written += 1;
    } else {
      skipped += 1;
    }

    details.push({
      projectDir,
      indexPath,
      sessions: entries.length,
      wrote: !dryRun,
    });
  }

  sessionMetaCache.clear();
  return {
    ok: true,
    dryRun,
    projects: projectDirs.length,
    sessions: totalSessions,
    written,
    skipped,
    details,
  };
}

function buildSessionKey(sessionId, fullPath, indexPath = '') {
  return Buffer.from(JSON.stringify({ sessionId, fullPath, indexPath }), 'utf8').toString('base64url');
}

function lineMatchesQuery(text, queryLower) {
  return normalizeText(text).toLowerCase().includes(queryLower);
}

function globalSearchSessions(query, { limit = 200, includeSubagents = false } = {}) {
  const rawQuery = normalizeText(query);
  const queryLower = rawQuery.toLowerCase();
  if (!rawQuery) {
    return [];
  }

  const cap = Math.max(1, Math.min(1000, Number(limit) || 200));
  const indexByPath = loadIndexEntriesByFullPath();
  const mainFiles = collectMainSessionFiles(indexByPath);
  const hits = [];
  const sessionById = new Map();

  for (const file of mainFiles) {
    sessionById.set(file.sessionId, file);
    const lines = readJsonLines(file.fullPath);
    for (let i = 0; i < lines.length; i += 1) {
      if (hits.length >= cap) break;

      let obj;
      try {
        obj = JSON.parse(lines[i]);
      } catch {
        continue;
      }

      const type = normalizeText(obj?.type);
      const role = type === 'user' || type === 'assistant' ? type : 'system';
      let text = '';
      if (type === 'user' || type === 'assistant') {
        text = extractTimelineText(obj?.message?.content);
      } else if (type === 'system') {
        text = normalizeText(obj?.message || obj?.summary || obj?.subtype || '');
      }

      if (!text || !lineMatchesQuery(text, queryLower)) {
        continue;
      }

      hits.push({
        sessionId: file.sessionId,
        key: buildSessionKey(file.sessionId, file.fullPath, file.indexPath),
        timestamp: normalizeText(obj?.timestamp || obj?.message?.timestamp),
        role,
        sourceKind: 'main',
        sourceFile: safeRelative(file.projectDir, file.fullPath),
        lineNo: i + 1,
        text,
      });
    }

    if (hits.length >= cap) break;
  }

  if (includeSubagents && hits.length < cap) {
    for (const file of mainFiles) {
      if (hits.length >= cap) break;

      const subagentDir = path.join(path.dirname(file.fullPath), file.sessionId, 'subagents');
      if (!fs.existsSync(subagentDir)) continue;

      const subFiles = fs.readdirSync(subagentDir, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith('.jsonl'))
        .map((f) => path.join(subagentDir, f.name));

      for (const subFile of subFiles) {
        if (hits.length >= cap) break;
        const sourceKind = COMPACT_NAME_RE.test(path.basename(subFile)) ? 'compact' : 'subagent';
        const lines = readJsonLines(subFile);
        for (let i = 0; i < lines.length; i += 1) {
          if (hits.length >= cap) break;
          let obj;
          try {
            obj = JSON.parse(lines[i]);
          } catch {
            continue;
          }

          const type = normalizeText(obj?.type);
          const role = type === 'user' || type === 'assistant' ? type : 'system';
          let text = '';
          if (type === 'user' || type === 'assistant') {
            text = extractTimelineText(obj?.message?.content);
          } else if (type === 'system') {
            text = normalizeText(obj?.message || obj?.summary || obj?.subtype || '');
          }

          if (!text || !lineMatchesQuery(text, queryLower)) {
            continue;
          }

          hits.push({
            sessionId: file.sessionId,
            key: buildSessionKey(file.sessionId, file.fullPath, file.indexPath),
            timestamp: normalizeText(obj?.timestamp || obj?.message?.timestamp),
            role,
            sourceKind,
            sourceFile: safeRelative(file.projectDir, subFile),
            lineNo: i + 1,
            text,
          });
        }
      }
    }
  }

  hits.sort((a, b) => {
    const bt = parseTimeSafe(b.timestamp) || 0;
    const at = parseTimeSafe(a.timestamp) || 0;
    return bt - at;
  });

  return hits.slice(0, cap);
}

function exportSessionsBatch(keys) {
  const unique = [...new Set((Array.isArray(keys) ? keys : []).map((x) => String(x || '')))].filter(Boolean);
  const items = [];

  for (const key of unique) {
    const detail = sessionDetailByKey(key);
    if (!detail) {
      continue;
    }
    items.push(detail);
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const filename = `session-batch-export-${stamp}.md`;

  const lines = [];
  lines.push('# Session Batch Export');
  lines.push('');
  lines.push(`- Exported At: ${now.toISOString()}`);
  lines.push(`- Count: ${items.length}`);
  lines.push('');

  for (const d of items) {
    lines.push(`## ${d.customName ? `${d.customName} ` : ''}(${d.sessionId})`);
    lines.push('');
    lines.push(`- Project: ${d.projectPath || '(unknown)'}`);
    lines.push(`- Modified: ${d.modified || d.created || ''}`);
    lines.push(`- Messages: ${d.messageCount}`);
    if (Array.isArray(d.customTags) && d.customTags.length > 0) {
      lines.push(`- Tags: ${d.customTags.join(', ')}`);
    }
    lines.push('');
    lines.push('### Summary');
    lines.push('');
    lines.push(d.summary || '—');
    lines.push('');
    lines.push('### First Prompt');
    lines.push('');
    lines.push(d.firstPrompt || '—');
    lines.push('');
    lines.push('### Last Prompt');
    lines.push('');
    lines.push(d.lastPrompt || '—');
    lines.push('');
  }

  return {
    filename,
    content: `${lines.join('\n')}\n`,
    count: items.length,
  };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('请求体过大'));
      }
    });

    req.on('end', () => {
      resolve(raw);
    });

    req.on('error', reject);
  });
}

function sessionDetailByKey(rawKey) {
  const meta = decodeKey(rawKey);
  if (!meta) {
    return null;
  }

  const fileMeta = getSessionMeta(meta.fullPath);
  const customMeta = getCustomMetaForPath(meta.fullPath);

  let entry = null;
  if (meta.indexPath) {
    const indexData = readJsonSafe(meta.indexPath);
    if (Array.isArray(indexData?.entries)) {
      entry = indexData.entries.find((item) => normalizeText(item?.sessionId) === meta.sessionId) || null;
    }
  }

  return {
    key: rawKey,
    sessionId: meta.sessionId,
    fullPath: meta.fullPath,
    indexPath: meta.indexPath,
    projectPath: normalizeText(entry?.projectPath) || fileMeta.projectPath,
    modified: normalizeText(entry?.modified) || fileMeta.modified,
    created: normalizeText(entry?.created) || fileMeta.created,
    summary: normalizeText(entry?.summary) || fileMeta.summary,
    firstPrompt: fileMeta.firstPrompt || normalizeText(entry?.firstPrompt),
    lastPrompt: fileMeta.lastPrompt,
    messageCount: Number(entry?.messageCount || fileMeta.messageCount || 0),
    recentUserPrompts: fileMeta.recentUserPrompts.slice(-8),
    customName: customMeta.name,
    customTags: customMeta.tags,
  };
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
  const pathname = reqUrl.pathname;

  if (req.method === 'GET' && pathname === '/') {
    if (!fs.existsSync(INDEX_HTML_PATH)) {
      sendText(res, 500, 'index.html 未找到');
      return;
    }

    sendText(res, 200, fs.readFileSync(INDEX_HTML_PATH, 'utf8'), 'text/html; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && pathname === '/api/sessions') {
    const sessions = listSessionRecords();
    sendJson(res, 200, {
      root: CLAUDE_PROJECTS,
      count: sessions.length,
      sessions,
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/session-detail') {
    const key = reqUrl.searchParams.get('key');
    const detail = sessionDetailByKey(key);

    if (!detail) {
      sendJson(res, 404, { error: '找不到会话' });
      return;
    }

    sendJson(res, 200, detail);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/recovery/session') {
    const sessionId = normalizeText(reqUrl.searchParams.get('sessionId'));
    const includeSubagents = reqUrl.searchParams.get('includeSubagents') !== '0';

    if (!isValidSessionId(sessionId)) {
      sendJson(res, 400, { error: 'sessionId 无效，必须是 UUID 格式。' });
      return;
    }

    const data = buildRecoverySession(sessionId, includeSubagents);
    if (!data) {
      sendJson(res, 404, { error: '找不到该 session 的本地文件。' });
      return;
    }

    sendJson(res, 200, data);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/search-global') {
    const q = normalizeText(reqUrl.searchParams.get('q'));
    const limit = Number(reqUrl.searchParams.get('limit') || 200);
    const includeSubagents = reqUrl.searchParams.get('includeSubagents') === '1';

    if (!q) {
      sendJson(res, 400, { error: 'q 不能为空' });
      return;
    }

    const hits = globalSearchSessions(q, { limit, includeSubagents });
    sendJson(res, 200, {
      query: q,
      count: hits.length,
      includeSubagents,
      hits,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/session-custom-meta') {
    try {
      const bodyRaw = await readRequestBody(req);
      const body = JSON.parse(bodyRaw || '{}');
      const key = normalizeText(body?.key);
      const name = normalizeText(body?.name);
      const tags = normalizeTags(body?.tags);

      const decoded = decodeKey(key);
      if (!decoded) {
        sendJson(res, 400, { error: 'key 无效' });
        return;
      }

      const saved = setCustomMetaForPath(decoded.fullPath, { name, tags });
      sessionMetaCache.clear();
      sendJson(res, 200, {
        ok: true,
        key,
        name: saved.name,
        tags: saved.tags,
      });
      return;
    } catch (error) {
      sendJson(res, 400, { error: `请求错误: ${error.message}` });
      return;
    }
  }

  if (req.method === 'POST' && pathname === '/api/rebuild-index') {
    try {
      const bodyRaw = await readRequestBody(req);
      const body = JSON.parse(bodyRaw || '{}');
      const dryRun = Boolean(body?.dryRun);
      const result = rebuildSessionIndexes({ dryRun });
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 400, { error: `请求错误: ${error.message}` });
      return;
    }
  }

  if (req.method === 'POST' && pathname === '/api/export-batch') {
    try {
      const bodyRaw = await readRequestBody(req);
      const body = JSON.parse(bodyRaw || '{}');
      const keys = Array.isArray(body?.keys) ? body.keys : [];
      if (keys.length === 0) {
        sendJson(res, 400, { error: 'keys 不能为空' });
        return;
      }

      const result = exportSessionsBatch(keys);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 400, { error: `请求错误: ${error.message}` });
      return;
    }
  }

  if (req.method === 'POST' && pathname === '/api/delete') {
    try {
      const bodyRaw = await readRequestBody(req);
      const body = JSON.parse(bodyRaw || '{}');
      const keys = Array.isArray(body?.keys) ? body.keys : [];

      if (keys.length === 0) {
        sendJson(res, 400, { error: 'keys 不能为空' });
        return;
      }

      const result = deleteSessions(keys);
      sendJson(res, result.ok ? 200 : 207, result);
      return;
    } catch (error) {
      sendJson(res, 400, { error: `请求错误: ${error.message}` });
      return;
    }
  }

  sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`SessionDeck running at http://127.0.0.1:${PORT}\n`);
  process.stdout.write(`Session root: ${CLAUDE_PROJECTS}\n`);
});
