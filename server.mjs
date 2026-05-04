import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const dataFile = join(root, "data-store.json");
const dataDir = join(root, "data");
const sqliteFile = join(dataDir, "news-war-room.db");
const port = Number(process.env.PORT || 4174);

const categories = ["AI", "慈善", "金融", "教育"];
const priorityMinutes = { realtime: 1, hourly: 60, daily: 1440 };
const HIGH_IMPACT_THRESHOLD = 55;

const feeds = [
  makeFeed("google-ai", "Google News - AI", "AI OR 人工智慧 OR ChatGPT OR 生成式AI OR 大型語言模型", "AI", "realtime"),
  makeFeed("google-charity", "Google News - 慈善", "慈善 OR 公益 OR 捐款 OR 非營利 OR 社福 OR 基金會", "慈善", "hourly"),
  makeFeed("google-finance", "Google News - 金融", "金融 OR 股市 OR 投資 OR 利率 OR 匯率 OR 銀行 OR 保險", "金融", "hourly"),
  makeFeed("google-education", "Google News - 教育", "教育 OR 學校 OR 大學 OR 教師 OR 學習 OR 教育部", "教育", "realtime")
];

const tagRules = [
  { tag: "人工智慧", words: ["ai", "人工智慧", "生成式", "chatgpt", "gemini", "copilot", "llm", "模型", "機器學習"] },
  { tag: "慈善公益", words: ["慈善", "公益", "捐款", "捐贈", "非營利", "社福", "基金會", "弱勢", "志工"] },
  { tag: "金融市場", words: ["金融", "股市", "投資", "利率", "匯率", "銀行", "保險", "基金", "資金", "市場"] },
  { tag: "教育學習", words: ["教育", "學校", "大學", "學生", "教師", "課程", "學習", "教育部", "校園"] },
  { tag: "政策法規", words: ["政策", "法規", "監管", "教育部", "補助", "揭露", "合規", "政府"] },
  { tag: "社會影響", words: ["影響", "弱勢", "偏鄉", "社區", "公益", "永續", "志工", "就業"] }
];

const positiveWords = ["成長", "合作", "改善", "升級", "投資", "擴大", "捐助", "補助", "受惠", "提升", "創新", "獲利", "增加"];
const negativeWords = ["下滑", "衝擊", "風險", "虧損", "調查", "違規", "不足", "爭議", "延宕", "缺口", "詐騙", "裁撤", "刪掉", "刪除", "事故", "故障", "外洩", "中斷"];
const impactWords = ["AI", "人工智慧", "慈善", "公益", "金融", "股市", "投資", "利率", "教育", "學校", "政策", "政府", "補助"];

const fallbackArticles = [
  fallbackArticle({
    title: "企業導入生成式 AI，資料治理與成本控管成為採購重點",
    source: "Tech Radar",
    category: "AI",
    publishedAt: "2026-04-29T01:30:00.000Z",
    text: "大型企業持續擴大生成式 AI 導入範圍，採購評估已從模型能力轉向資料治理、資安、推論成本與可稽核流程。"
  }),
  fallbackArticle({
    title: "大型基金會擴大公益捐助，弱勢家庭與偏鄉教育列為優先項目",
    source: "Charity Brief",
    category: "慈善",
    publishedAt: "2026-04-29T00:50:00.000Z",
    text: "公益團體宣布擴大捐助規模，資源將投入弱勢家庭、偏鄉教育與社區照護，預期帶動更多企業參與社會影響投資。"
  }),
  fallbackArticle({
    title: "金融市場關注利率走向，銀行與保險類股表現分歧",
    source: "Market Desk",
    category: "金融",
    publishedAt: "2026-04-28T11:20:00.000Z",
    text: "投資人持續觀察利率與匯率變化，銀行股受惠於利差改善，但保險業仍面臨資產評價波動風險。"
  }),
  fallbackArticle({
    title: "教育部推動 AI 學習資源，教師培訓與課程設計同步升級",
    source: "Education Watch",
    category: "教育",
    publishedAt: "2026-04-28T08:10:00.000Z",
    text: "教育部規劃導入 AI 學習工具，並補助學校進行教師培訓與數位課程設計，縮小城鄉學習落差。"
  })
];

const store = {
  articles: new Map(fallbackArticles.map((item) => [item.fingerprint, item])),
  history: [],
  alerts: [],
  watchlist: {},
  marketingTasks: {},
  lastRefresh: { refreshedFeeds: 0, errors: [], refreshedAt: null }
};

let saveChain = Promise.resolve();
let db = null;

async function initSqliteStore() {
  if (db) return db;
  await mkdir(dataDir, { recursive: true });
  db = new Database(sqliteFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      category TEXT,
      priority TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS articles (
      fingerprint TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      title TEXT,
      category TEXT,
      source TEXT,
      published_at TEXT,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
    CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
    CREATE TABLE IF NOT EXISTS history (
      hour TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      key TEXT PRIMARY KEY,
      created_at TEXT,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      article_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS marketing_tasks (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      status TEXT,
      priority TEXT,
      type TEXT,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function sqliteHasData() {
  const database = db;
  if (!database) return false;
  const tables = ["feeds", "articles", "history", "alerts", "watchlist", "marketing_tasks"];
  return tables.some((table) => database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count > 0);
}

function alertKey(alert, index) {
  return alert.key || alert.id || createHash("sha1").update(`${alert.createdAt || index}:${alert.message || ""}`).digest("hex");
}

function loadSnapshotFromSqlite() {
  const database = db;
  const parseRows = (sql) => database.prepare(sql).all().map((row) => JSON.parse(row.payload));
  const lastRefresh = database.prepare("SELECT value FROM metadata WHERE key = ?").get("lastRefresh");
  return {
    version: 2,
    savedAt: database.prepare("SELECT value FROM metadata WHERE key = ?").get("savedAt")?.value || null,
    feeds: parseRows("SELECT payload FROM feeds ORDER BY id"),
    articles: parseRows("SELECT payload FROM articles ORDER BY published_at DESC"),
    history: parseRows("SELECT payload FROM history ORDER BY hour"),
    alerts: parseRows("SELECT payload FROM alerts ORDER BY created_at DESC"),
    watchlist: Object.fromEntries(parseRows("SELECT payload FROM watchlist ORDER BY article_id").map((item) => [item.articleId, item])),
    marketingTasks: Object.fromEntries(parseRows("SELECT payload FROM marketing_tasks ORDER BY updated_at DESC").map((item) => [item.id, item])),
    lastRefresh: lastRefresh ? JSON.parse(lastRefresh.value) : null
  };
}

function writeSnapshotToSqlite(snapshot) {
  const database = db;
  const now = new Date().toISOString();
  const writeMetadata = database.prepare(`
    INSERT INTO metadata (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const insertFeed = database.prepare(`
    INSERT INTO feeds (id, category, priority, enabled, payload, updated_at)
    VALUES (@id, @category, @priority, @enabled, @payload, @updated_at)
  `);
  const insertArticle = database.prepare(`
    INSERT INTO articles (fingerprint, article_id, title, category, source, published_at, payload, updated_at)
    VALUES (@fingerprint, @article_id, @title, @category, @source, @published_at, @payload, @updated_at)
  `);
  const insertHistory = database.prepare("INSERT INTO history (hour, payload, updated_at) VALUES (?, ?, ?)");
  const insertAlert = database.prepare("INSERT INTO alerts (key, created_at, payload, updated_at) VALUES (?, ?, ?, ?)");
  const insertWatchlist = database.prepare("INSERT INTO watchlist (article_id, payload, updated_at) VALUES (?, ?, ?)");
  const insertTask = database.prepare(`
    INSERT INTO marketing_tasks (id, source_id, status, priority, type, payload, updated_at)
    VALUES (@id, @source_id, @status, @priority, @type, @payload, @updated_at)
  `);

  const transaction = database.transaction(() => {
    for (const table of ["feeds", "articles", "history", "alerts", "watchlist", "marketing_tasks"]) {
      database.prepare(`DELETE FROM ${table}`).run();
    }
    writeMetadata.run("savedAt", snapshot.savedAt || now, now);
    writeMetadata.run("lastRefresh", JSON.stringify(snapshot.lastRefresh || {}), now);
    for (const feed of snapshot.feeds || []) {
      insertFeed.run({
        id: feed.id,
        category: feed.category || "",
        priority: feed.priority || "",
        enabled: feed.enabled === false ? 0 : 1,
        payload: JSON.stringify(feed),
        updated_at: now
      });
    }
    for (const article of snapshot.articles || []) {
      insertArticle.run({
        fingerprint: article.fingerprint || article.id,
        article_id: article.id || article.fingerprint,
        title: article.title || "",
        category: article.category || "",
        source: article.source || "",
        published_at: article.publishedAt || "",
        payload: JSON.stringify(article),
        updated_at: now
      });
    }
    for (const entry of snapshot.history || []) {
      insertHistory.run(entry.hour, JSON.stringify(entry), now);
    }
    for (const [index, alert] of (snapshot.alerts || []).entries()) {
      insertAlert.run(alertKey(alert, index), alert.createdAt || "", JSON.stringify(alert), now);
    }
    for (const item of Object.values(snapshot.watchlist || {})) {
      insertWatchlist.run(item.articleId, JSON.stringify(item), now);
    }
    for (const task of Object.values(snapshot.marketingTasks || {})) {
      insertTask.run({
        id: task.id,
        source_id: task.sourceId || "",
        status: task.status || "",
        priority: task.priority || "",
        type: task.type || "",
        payload: JSON.stringify(task),
        updated_at: now
      });
    }
  });
  transaction();
}

function applySnapshot(data) {
  if (Array.isArray(data.feeds) && data.feeds.length) {
    feeds.splice(0, feeds.length, ...data.feeds.map(normalizeStoredFeed));
  }
  if (Array.isArray(data.articles)) {
    store.articles = new Map(data.articles.map(normalizeStoredArticle).map((article) => [article.fingerprint, article]));
  }
  if (Array.isArray(data.history)) store.history = data.history;
  if (Array.isArray(data.alerts)) store.alerts = data.alerts;
  if (data.watchlist && typeof data.watchlist === "object") store.watchlist = data.watchlist;
  if (data.marketingTasks && typeof data.marketingTasks === "object") store.marketingTasks = data.marketingTasks;
  if (data.lastRefresh && typeof data.lastRefresh === "object") store.lastRefresh = data.lastRefresh;
  pruneArticlesToActiveTopics();
}

function normalizeStoredFeed(feed) {
  const id = String(feed.id || topicId(feed.category || feed.name || feed.query || "topic"));
  const category = String(feed.category || feed.name || feed.query || "AI").trim() || "AI";
  const query = String(feed.query || category).trim() || category;
  const normalized = makeFeed(
    id,
    String(feed.name || `Google News - ${category}`),
    query,
    category,
    priorityMinutes[feed.priority] ? feed.priority : "hourly"
  );
  normalized.url = feed.url || googleNewsUrl(query);
  normalized.enabled = feed.enabled !== false;
  normalized.lastFetchedAt = feed.lastFetchedAt || null;
  normalized.nextFetchAt = feed.nextFetchAt || null;
  return normalized;
}

function normalizeStoredArticle(article) {
  const fullText = String(article.fullText || article.description || article.summary || article.title || "");
  const fingerprint = article.fingerprint || article.id || fingerprintFor(article.title || "", fullText);
  const body = `${article.title || ""} ${fullText}`;
  const tags = Array.isArray(article.tags) ? article.tags : extractTags(body);
  const sentiment = article.sentiment || scoreSentiment(body);
  const impact = Number.isFinite(article.impact) ? article.impact : scoreImpact({ title: article.title || "", text: fullText, publishedAt: article.publishedAt || new Date().toISOString() }).value;
  return {
    ...article,
    id: article.id || fingerprint,
    fingerprint,
    fullText,
    tags,
    sentiment,
    impact,
    marketing: article.marketing || analyzeMarketingOpportunity({
      title: article.title || "",
      text: fullText,
      category: article.category || "未分類",
      tags,
      sentiment,
      impact
    }),
    vector: Array.isArray(article.vector) ? article.vector : vectorize(`${article.title || ""} ${fullText}`)
  };
}

function snapshotStore() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    feeds,
    articles: [...store.articles.values()],
    history: store.history,
    alerts: store.alerts,
    watchlist: store.watchlist,
    marketingTasks: store.marketingTasks,
    lastRefresh: store.lastRefresh
  };
}

async function saveStore() {
  const snapshot = snapshotStore();
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      await initSqliteStore();
      writeSnapshotToSqlite(snapshot);
      await writeFile(dataFile, JSON.stringify(snapshot, null, 2), "utf8");
    });
  await saveChain;
}

async function loadStore() {
  await initSqliteStore();
  try {
    if (sqliteHasData()) {
      applySnapshot(loadSnapshotFromSqlite());
      return;
    }
    applySnapshot(JSON.parse(await readFile(dataFile, "utf8")));
    await saveStore();
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Unable to load ${dataFile}: ${error.message}`);
    await saveStore();
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function makeFeed(id, name, query, category, priority) {
  return {
    id,
    name,
    query,
    url: googleNewsUrl(query),
    category,
    priority,
    enabled: true,
    lastFetchedAt: null,
    nextFetchAt: null
  };
}

function currentCategories() {
  return [...new Set(feeds.map((feed) => feed.category))];
}

function activeCategories() {
  return new Set(feeds.filter((feed) => feed.enabled).map((feed) => feed.category));
}

function pruneArticlesToActiveTopics() {
  const active = activeCategories();
  for (const [fingerprint, article] of store.articles) {
    if (article.feedId !== "fallback" && !active.has(article.category)) {
      store.articles.delete(fingerprint);
    }
  }
}

function publicTopics() {
  return feeds.map((feed) => ({
    id: feed.id,
    name: feed.category,
    query: feed.query,
    priority: feed.priority,
    enabled: feed.enabled,
    lastFetchedAt: feed.lastFetchedAt,
    nextFetchAt: feed.nextFetchAt
  }));
}

function topicId(name) {
  return `topic-${createHash("sha1").update(name).digest("hex").slice(0, 10)}`;
}

function upsertTopic({ name, query, priority = "hourly", enabled = true }) {
  const cleanName = String(name || "").trim();
  const cleanQuery = String(query || cleanName).trim();
  if (!cleanName) throw new Error("Topic name is required.");
  if (!cleanQuery) throw new Error("Topic query is required.");
  const id = topicId(cleanName);
  const feed = makeFeed(id, `Google News - ${cleanName}`, cleanQuery, cleanName, priorityMinutes[priority] ? priority : "hourly");
  feed.enabled = Boolean(enabled);
  const index = feeds.findIndex((item) => item.id === id);
  if (index >= 0) feeds[index] = feed;
  else feeds.push(feed);
  return feed;
}

function resetDefaultTopics() {
  feeds.splice(
    0,
    feeds.length,
    makeFeed("google-ai", "Google News - AI", "AI OR 人工智慧 OR ChatGPT OR 生成式AI OR 大型語言模型", "AI", "realtime"),
    makeFeed("google-charity", "Google News - 慈善", "慈善 OR 公益 OR 捐款 OR 非營利 OR 社福 OR 基金會", "慈善", "hourly"),
    makeFeed("google-finance", "Google News - 金融", "金融 OR 股市 OR 投資 OR 利率 OR 匯率 OR 銀行 OR 保險", "金融", "hourly"),
    makeFeed("google-education", "Google News - 教育", "教育 OR 學校 OR 大學 OR 教師 OR 學習 OR 教育部", "教育", "realtime")
  );
  pruneArticlesToActiveTopics();
  return publicTopics();
}

function googleNewsUrl(query) {
  const params = new URLSearchParams({ q: `${query} when:7d`, hl: "zh-TW", gl: "TW", ceid: "TW:zh-Hant" });
  return `https://news.google.com/rss/search?${params}`;
}

function fallbackArticle(input) {
  return enrichArticle({
    title: input.title,
    source: input.source,
    link: "https://news.google.com/",
    description: input.text,
    publishedAt: input.publishedAt,
    feed: { id: "fallback", name: "Fallback Demo", category: input.category }
  });
}

function decodeEntities(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function cleanText(value = "") {
  return decodeEntities(String(value))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|aside|header|footer|form|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b(訂閱|廣告|cookie|copyright|all rights reserved|登入|分享)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return cleanText(value);
}

function getTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(match[1].trim()) : "";
}

function parseRss(xml, feed) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const raw = match[1];
      const title = stripTags(getTag(raw, "title"));
      const link = stripTags(getTag(raw, "link"));
      const description = stripTags(getTag(raw, "description"));
      const source = stripTags(getTag(raw, "source")) || feed.name;
      const pubDate = stripTags(getTag(raw, "pubDate")) || stripTags(getTag(raw, "published"));
      const publishedAt = Number.isNaN(Date.parse(pubDate)) ? new Date().toISOString() : new Date(pubDate).toISOString();
      return { title, link, description, source, publishedAt, feed };
    })
    .filter((item) => item.title && item.link);
}

function summarize(text = "") {
  const compact = cleanText(text);
  if (!compact) return "目前僅取得 RSS 摘要，尚未擷取到可分析的全文內容。";
  const sentences = compact.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  return (sentences.slice(0, 2).join("") || compact).slice(0, 110);
}

function fingerprintFor(title, text) {
  const normalized = `${title} ${text.slice(0, 500)}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return createHash("sha1").update(normalized).digest("hex").slice(0, 16);
}

function extractTags(text = "") {
  const lower = text.toLowerCase();
  const tags = tagRules
    .filter((rule) => rule.words.some((word) => lower.includes(word.toLowerCase())))
    .map((rule) => rule.tag);
  return tags.length ? [...new Set(tags)] : ["一般新聞"];
}

function scoreSentiment(text = "") {
  const positiveHits = positiveWords.filter((word) => text.includes(word));
  const negativeHits = negativeWords.filter((word) => text.includes(word));
  const value = Math.max(-100, Math.min(100, (positiveHits.length - negativeHits.length) * 22));
  return {
    value,
    label: value > 15 ? "正面" : value < -15 ? "負面" : "中性",
    reason: positiveHits.length || negativeHits.length
      ? `正面詞：${positiveHits.join("、") || "無"}；負面詞：${negativeHits.join("、") || "無"}`
      : "未命中明顯正負面詞"
  };
}

function scoreImpact({ title, text, publishedAt }) {
  const haystack = `${title} ${text}`;
  const matchedSignals = impactWords.filter((word) => haystack.includes(word));
  const signalScore = matchedSignals.length * 9;
  const ageHours = Math.max(1, (Date.now() - Date.parse(publishedAt)) / 36e5);
  const recencyScore = Math.max(0, 28 - ageHours);
  const lengthScore = Math.min(16, Math.round(text.length / 180));
  const value = Math.max(1, Math.min(100, Math.round(24 + signalScore + recencyScore + lengthScore)));
  const factors = [
    `主題訊號 ${matchedSignals.length} 個${matchedSignals.length ? `：${matchedSignals.join("、")}` : ""}`,
    `時效分 ${Math.round(recencyScore)}，約 ${Math.round(ageHours)} 小時前發布`,
    `內容完整度分 ${lengthScore}`
  ];
  return {
    value,
    factors,
    reason: `影響力 ${value} 分，來自主題訊號、新聞時效與內容完整度綜合評估。`
  };
}

function analyzeMarketingOpportunity({ title, text, category, tags = [], sentiment, impact }) {
  const body = `${title} ${text} ${tags.join(" ")}`;
  const positive = Math.max(0, sentiment?.value || 0);
  const negative = Math.max(0, -(sentiment?.value || 0));
  const evergreenSignals = ["指南", "教學", "趨勢", "研究", "報告", "政策", "AI", "教育", "金融", "公益", "慈善"];
  const conversionSignals = ["補助", "方案", "服務", "工具", "平台", "課程", "申請", "投資", "保險", "銀行"];
  const riskSignals = ["爭議", "詐騙", "裁員", "下滑", "警告", "風險", "調查", "違法", "危機"];
  const evergreenHits = evergreenSignals.filter((word) => body.includes(word));
  const conversionHits = conversionSignals.filter((word) => body.includes(word));
  const riskHits = riskSignals.filter((word) => body.includes(word));
  const score = Math.max(1, Math.min(100, Math.round(
    20 +
    impact * 0.42 +
    evergreenHits.length * 7 +
    conversionHits.length * 6 +
    positive * 0.18 -
    negative * 0.22 -
    riskHits.length * 8
  )));
  const risk = riskHits.length || negative > 25
    ? "高"
    : negative > 10
      ? "中"
      : "低";
  const intent = conversionHits.length
    ? "決策型"
    : risk !== "低"
      ? "風險型"
      : evergreenHits.length
        ? "認知型"
        : "探索型";
  const channels = [
    score >= 60 && risk !== "高" ? "社群貼文" : null,
    evergreenHits.length ? "SEO 文章" : null,
    conversionHits.length ? "EDM / 銷售素材" : null,
    risk !== "低" ? "公關觀察" : null,
    impact >= HIGH_IMPACT_THRESHOLD ? "短影音切角" : null
  ].filter(Boolean);
  const label = score >= 72 ? "高機會" : score >= 48 ? "可觀察" : "低優先";
  const safeTitle = title.replace(/\s+/g, " ").trim();
  const primaryTag = tags[0] || category;
  const ideas = [
    `「${primaryTag}」趨勢懶人包：從這則新聞看接下來的市場變化`,
    `社群短貼文：用 3 個重點說明「${safeTitle.slice(0, 32)}」`,
    `FAQ 題材：使用者看到這則新聞後最可能問的 5 個問題`
  ];
  if (risk !== "低") ideas.push(`風險溝通稿：整理事件影響、品牌立場與可回應範圍`);
  if (conversionHits.length) ideas.push(`轉換型內容：把「${conversionHits[0]}」延伸成方案比較或行動指南`);

  return {
    score,
    label,
    intent,
    risk,
    channels: channels.length ? channels : ["內容觀察"],
    reason: `分數來自影響力 ${impact}、內容題材訊號 ${evergreenHits.length + conversionHits.length} 個、負面風險 ${riskHits.length} 個與情緒 ${sentiment?.value || 0}。`,
    ideas: ideas.slice(0, 4)
  };
}

function tokenize(text = "") {
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z0-9]{2,}|[\p{Script=Han}]{1,}/gu) || [];
  const cjkBigrams = [];
  for (const word of words) {
    if (/^[\p{Script=Han}]+$/u.test(word) && word.length > 1) {
      for (let i = 0; i < word.length - 1; i += 1) cjkBigrams.push(word.slice(i, i + 2));
    }
  }
  return [...new Set([...words, ...cjkBigrams])];
}

function vectorize(text = "") {
  const vector = Array.from({ length: 96 }, () => 0);
  for (const token of tokenize(text)) {
    const hash = createHash("md5").update(token).digest();
    vector[hash[0] % vector.length] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

function cosine(a, b) {
  return a.reduce((sum, value, index) => sum + value * (b[index] || 0), 0);
}

function keywordOverlap(query, text) {
  if (!query.trim()) return 0;
  const queryTokens = tokenize(query);
  const textTokens = new Set(tokenize(text));
  const hits = queryTokens.filter((token) => textTokens.has(token)).length;
  return queryTokens.length ? hits / queryTokens.length : 0;
}

function enrichArticle(raw) {
  const fullText = cleanText(raw.description);
  const summary = summarize(fullText);
  const fingerprint = fingerprintFor(raw.title, fullText);
  const body = `${raw.title} ${fullText}`;
  const impactAnalysis = scoreImpact({ title: raw.title, text: fullText, publishedAt: raw.publishedAt });
  const tags = extractTags(body);
  const sentiment = scoreSentiment(body);
  const marketing = analyzeMarketingOpportunity({
    title: raw.title,
    text: fullText,
    category: raw.feed.category,
    tags,
    sentiment,
    impact: impactAnalysis.value
  });
  return {
    id: fingerprint,
    fingerprint,
    title: raw.title,
    source: raw.source,
    link: raw.link,
    category: raw.feed.category,
    feedId: raw.feed.id,
    feedName: raw.feed.name,
    publishedAt: raw.publishedAt,
    fetchedAt: new Date().toISOString(),
    fullText,
    summary,
    tags,
    sentiment,
    impact: impactAnalysis.value,
    impactReason: impactAnalysis.reason,
    impactFactors: impactAnalysis.factors,
    marketing,
    vector: vectorize(body)
  };
}

async function fetchText(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "NewsWarRoom/0.2 (+local dashboard)" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function refreshFeeds({ force = false } = {}) {
  const now = Date.now();
  const dueFeeds = feeds.filter((feed) => feed.enabled && (force || !feed.nextFetchAt || Date.parse(feed.nextFetchAt) <= now));
  const errors = [];

  const batches = await Promise.allSettled(
    dueFeeds.map(async (feed) => {
      const xml = await fetchText(feed.url);
      const articles = parseRss(xml, feed).slice(0, 18).map(enrichArticle);
      const intervalMs = (priorityMinutes[feed.priority] || 60) * 60 * 1000;
      feed.lastFetchedAt = new Date().toISOString();
      feed.nextFetchAt = new Date(Date.now() + intervalMs).toISOString();
      return articles;
    })
  );

  for (const result of batches) {
    if (result.status === "fulfilled") {
      for (const item of result.value) store.articles.set(item.fingerprint, item);
    } else {
      errors.push(result.reason.message);
    }
  }

  recordHistory();
  evaluateAlerts();
  store.lastRefresh = { refreshedFeeds: dueFeeds.length, errors, refreshedAt: new Date().toISOString() };
  await saveStore();
  return store.lastRefresh;
}

function recordHistory() {
  const byTag = {};
  const hour = new Date().toISOString().slice(0, 13) + ":00:00.000Z";
  for (const item of store.articles.values()) {
    for (const tag of item.tags) byTag[tag] = (byTag[tag] || 0) + 1;
  }
  const previous = store.history.at(-1);
  if (previous?.hour === hour) previous.byTag = byTag;
  else store.history.push({ hour, byTag });
  store.history = store.history.slice(-168);
}

function evaluateAlerts() {
  const recent = [...store.articles.values()].filter((item) => Date.now() - Date.parse(item.publishedAt) <= 24 * 36e5);
  const counts = recent.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  for (const category of currentCategories()) {
    const count = counts[category] || 0;
    const threshold = category === "AI" || category === "慈善" ? 3 : 5;
    const key = `${category}-${new Date().toISOString().slice(0, 13)}`;
    if (count >= threshold && !store.alerts.some((alert) => alert.key === key)) {
      store.alerts.unshift({
        key,
        category,
        count,
        threshold,
        channel: "Slack / LINE / Email",
        message: `${category} 類別近 24 小時累積 ${count} 則新聞，已達 ${threshold} 則警告門檻。`,
        createdAt: new Date().toISOString(),
        status: "待發送"
      });
    }
  }
  store.alerts = store.alerts.slice(0, 20);
}

function filterArticles({ q = "", category = "all", tag = "all", filter = "all", sort = "latest" }) {
  const query = q.trim();
  const queryVector = query ? vectorize(query) : null;
  const active = activeCategories();
  return [...store.articles.values()]
    .map((item) => {
      const haystack = `${item.title} ${item.source} ${item.summary} ${item.fullText} ${item.tags.join(" ")}`;
      const semanticScore = queryVector
        ? Math.max(cosine(queryVector, item.vector), keywordOverlap(query, haystack))
        : null;
      return { ...item, semanticScore };
    })
    .filter((item) => {
      const haystack = `${item.title} ${item.source} ${item.summary} ${item.fullText} ${item.tags.join(" ")}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query.toLowerCase()) || item.semanticScore >= 0.16;
      const matchesActive = active.has(item.category) || item.feedId === "fallback";
      const matchesCategory = category === "all" || item.category === category;
      const matchesTag = tag === "all" || item.tags.includes(tag);
      const matchesFilter =
        filter === "high-impact" ? item.impact >= HIGH_IMPACT_THRESHOLD :
        filter === "negative" ? item.sentiment.value < -15 :
        true;
      return matchesActive && matchesQuery && matchesCategory && matchesTag && matchesFilter;
    })
    .sort((a, b) => {
      if (sort === "impact") return b.impact - a.impact || new Date(b.publishedAt) - new Date(a.publishedAt);
      if (sort === "sentiment") return a.sentiment.value - b.sentiment.value || new Date(b.publishedAt) - new Date(a.publishedAt);
      if (sort === "semantic") return (b.semanticScore || 0) - (a.semanticScore || 0) || new Date(b.publishedAt) - new Date(a.publishedAt);
      if (queryVector && b.semanticScore !== a.semanticScore) return b.semanticScore - a.semanticScore;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
}

function publicWatchlist() {
  return Object.values(store.watchlist)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .map((entry) => {
      const article = store.articles.get(entry.articleId);
      if (!article) return null;
      return {
        ...entry,
        article: {
          id: article.id,
          title: article.title,
          source: article.source,
          link: article.link,
          category: article.category,
          publishedAt: article.publishedAt,
          summary: article.summary,
          tags: article.tags,
          impact: article.impact,
          sentiment: article.sentiment,
          marketing: article.marketing
        }
      };
    })
    .filter(Boolean);
}

function taskIdFor(sourceId, idea = "") {
  return `mk-${createHash("sha1").update(`${sourceId}:${idea}`).digest("hex").slice(0, 12)}`;
}

function publicMarketingTasks() {
  return Object.values(store.marketingTasks)
    .sort((a, b) => {
      const statusWeight = { "待處理": 0, "撰寫中": 1, "待審核": 2, "已發布": 3, "暫緩": 4 };
      const priorityWeight = { "高": 0, "中": 1, "低": 2 };
      return (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9)
        || (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9)
        || new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    })
    .map((task) => {
      const article = store.articles.get(task.sourceId);
      return {
        ...task,
        article: article ? {
          id: article.id,
          title: article.title,
          source: article.source,
          link: article.link,
          category: article.category,
          impact: article.impact,
          marketing: article.marketing
        } : null
      };
    });
}

function safeFilename(value = "marketing-task") {
  return String(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "marketing-task";
}

function buildMarketingTaskMarkdown(task) {
  const article = store.articles.get(task.sourceId);
  const marketing = article?.marketing || {};
  const lines = [
    `# ${task.title}`,
    "",
    "## 任務資訊",
    `- 任務類型：${task.type || "未設定"}`,
    `- 狀態：${task.status || "未設定"}`,
    `- 優先級：${task.priority || "未設定"}`,
    `- 預計發布日：${task.dueDate || "未設定"}`,
    `- 目標受眾：${task.audience || "未設定"}`,
    `- CTA：${task.cta || "未設定"}`,
    "",
    "## 內容題材",
    task.idea || "未設定",
    "",
    "## 內容草稿",
    task.draft || "尚未撰寫內容草稿。",
    "",
    "## 備註",
    task.note || "無",
    "",
    "## 來源新聞",
    article ? `- 標題：${article.title}` : "- 原始新聞已不存在",
    article ? `- 分類：${article.category}` : "",
    article ? `- 來源：${article.source}` : "",
    article ? `- 連結：${article.link}` : "",
    article ? `- 影響力：${article.impact}` : "",
    "",
    "## 行銷判讀",
    `- 行銷機會：${marketing.label || "未分析"} ${marketing.score ?? ""}`.trim(),
    `- 受眾意圖：${marketing.intent || "未分析"}`,
    `- 品牌風險：${marketing.risk || "未分析"}`,
    `- 建議渠道：${Array.isArray(marketing.channels) ? marketing.channels.join(" / ") : "未分析"}`,
    marketing.reason ? `- 判斷原因：${marketing.reason}` : "",
    "",
    "## 可延伸題材",
    ...(Array.isArray(marketing.ideas) && marketing.ideas.length ? marketing.ideas.map((idea) => `- ${idea}`) : ["- 尚無延伸題材"]),
    "",
    `匯出時間：${new Date().toISOString()}`
  ];
  return lines.filter((line) => line !== "").join("\n");
}

function taipeiDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildDailyReport(allItems, hotTags) {
  const today = taipeiDayKey();
  const todayItems = allItems.filter((item) => taipeiDayKey(item.publishedAt) === today);
  const baseItems = todayItems.length ? todayItems : allItems.slice(0, 40);
  const highImpact = baseItems.filter((item) => item.impact >= HIGH_IMPACT_THRESHOLD);
  const negative = baseItems.filter((item) => item.sentiment.value < -15);
  const watchlist = publicWatchlist();
  const marketingItems = [...baseItems]
    .filter((item) => item.marketing)
    .sort((a, b) => b.marketing.score - a.marketing.score || b.impact - a.impact);
  const byCategory = currentCategories().map((category) => {
    const categoryItems = baseItems.filter((item) => item.category === category);
    const lead = [...categoryItems].sort((a, b) => b.impact - a.impact)[0];
    const negativeCount = categoryItems.filter((item) => item.sentiment.value < -15).length;
    return {
      category,
      count: categoryItems.length,
      highImpact: categoryItems.filter((item) => item.impact >= HIGH_IMPACT_THRESHOLD).length,
      negative: negativeCount,
      lead: lead ? {
        id: lead.id,
        title: lead.title,
        source: lead.source,
        impact: lead.impact,
        sentiment: lead.sentiment,
        summary: lead.summary
      } : null
    };
  });

  const topRisks = [...negative, ...highImpact]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((a, b) => b.impact - a.impact || a.sentiment.value - b.sentiment.value)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      source: item.source,
      impact: item.impact,
      sentiment: item.sentiment,
      reason: item.impactReason || item.sentiment.reason || item.summary
    }));

  const actions = [];
  if (store.alerts.length) actions.push(`先處理 ${store.alerts.length} 則警告，確認是否需要對外回應或內部升級。`);
  if (highImpact.length) actions.push(`檢查 ${highImpact.length} 則高影響力新聞，挑出需要加入追蹤清單的事件。`);
  if (negative.length) actions.push(`關注 ${negative.length} 則負面訊號，觀察是否形成連續風險。`);
  if (watchlist.length) actions.push(`回顧 ${watchlist.length} 則追蹤新聞，更新為需回報或已處理。`);
  if (!actions.length) actions.push("目前沒有明顯異常，維持每分鐘監測與主題追蹤。");
  const marketingActions = marketingItems.slice(0, 5).map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    score: item.marketing.score,
    label: item.marketing.label,
    intent: item.marketing.intent,
    risk: item.marketing.risk,
    channels: item.marketing.channels,
    idea: item.marketing.ideas[0],
    taskId: taskIdFor(item.id, item.marketing.ideas[0]),
    hasTask: Boolean(store.marketingTasks[taskIdFor(item.id, item.marketing.ideas[0])])
  }));

  return {
    date: today,
    generatedAt: new Date().toISOString(),
    overview: {
      news: baseItems.length,
      highImpact: highImpact.length,
      negative: negative.length,
      alerts: store.alerts.length,
      watchlist: watchlist.length
    },
    headline: highImpact[0]?.title || baseItems[0]?.title || "今日尚未取得足夠新聞。",
    categories: byCategory,
    trends: hotTags.slice(0, 5),
    risks: topRisks,
    tracked: watchlist.slice(0, 5),
    actions,
    marketingActions
  };
}

function buildTrendTimeline({ tag = "", range = "24h" } = {}) {
  const hours = range === "7d" ? 168 : 24;
  const latestHistory = store.history.at(-1)?.byTag || {};
  const historyTags = new Set();
  for (const entry of store.history) {
    for (const itemTag of Object.keys(entry.byTag || {})) historyTags.add(itemTag);
  }
  for (const article of store.articles.values()) {
    for (const itemTag of article.tags || []) historyTags.add(itemTag);
  }
  const availableTags = [...historyTags]
    .map((name) => ({ name, count: latestHistory[name] || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 30);
  const selectedTag = availableTags.some((item) => item.name === tag) ? tag : availableTags[0]?.name || "";
  const byHour = new Map(store.history.map((entry) => [entry.hour, entry.byTag || {}]));
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const points = [];

  for (let index = hours - 1; index >= 0; index -= 1) {
    const time = new Date(now.getTime() - index * 60 * 60 * 1000);
    const hour = time.toISOString().slice(0, 13) + ":00:00.000Z";
    const count = selectedTag ? byHour.get(hour)?.[selectedTag] || 0 : 0;
    points.push({ hour, count });
  }

  const total = points.reduce((sum, point) => sum + point.count, 0);
  const peak = points.reduce((max, point) => Math.max(max, point.count), 0);
  const midpoint = Math.floor(points.length / 2);
  const previous = points.slice(0, midpoint).reduce((sum, point) => sum + point.count, 0);
  const recent = points.slice(midpoint).reduce((sum, point) => sum + point.count, 0);
  const change = previous ? Math.round(((recent - previous) / previous) * 100) : recent ? 100 : 0;

  return {
    range,
    hours,
    selectedTag,
    availableTags,
    points,
    summary: { total, peak, recent, previous, change }
  };
}

function buildDashboard(query) {
  const items = filterArticles(query);
  const active = activeCategories();
  const all = [...store.articles.values()].filter((item) => active.has(item.category) || item.feedId === "fallback");
  const tagCounts = {};
  const categoryCounts = {};

  for (const item of items) {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    for (const tag of item.tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }

  const maxTagCount = Math.max(1, ...Object.values(tagCounts));
  const hotTags = Object.entries(tagCounts)
    .map(([name, count]) => {
      const taggedItems = items.filter((item) => item.tags.includes(name));
      const highImpactCount = taggedItems.filter((item) => item.impact >= HIGH_IMPACT_THRESHOLD).length;
      const averageImpact = taggedItems.reduce((sum, item) => sum + item.impact, 0) / Math.max(1, taggedItems.length);
      const heat = Math.round(12 + (count / maxTagCount) * 58 + highImpactCount * 4 + averageImpact * 0.22);
      return {
        name,
        count,
        heat: Math.min(100, heat)
      };
    })
    .sort((a, b) => b.heat - a.heat);

  return {
    updatedAt: new Date().toISOString(),
    categories: currentCategories(),
    feeds,
    topics: publicTopics(),
    lastRefresh: store.lastRefresh,
    summary: {
      totalNews: all.length,
      filteredNews: items.length,
      activeFeeds: feeds.filter((feed) => feed.enabled).length,
      highImpact: all.filter((item) => item.impact >= HIGH_IMPACT_THRESHOLD).length,
      alerts: store.alerts.length,
      watchlist: Object.keys(store.watchlist).length
    },
    categoryCounts,
    hotTags,
    history: store.history,
    trendTimeline: buildTrendTimeline({ tag: query.trendTag || "", range: query.trendRange || "24h" }),
    alerts: store.alerts,
    watchlist: publicWatchlist(),
    marketingTasks: publicMarketingTasks(),
    dailyReport: buildDailyReport(all, hotTags),
    items: items.slice(0, 80).map(({ vector, fullText, ...item }) => ({
      ...item,
      tracking: store.watchlist[item.id] || null,
      excerpt: fullText.slice(0, 360)
    })),
    brief: buildBrief(items, hotTags)
  };
}

function buildBrief(items, hotTags) {
  const lead = items[0];
  const topTag = hotTags[0];
  const negative = items.filter((item) => item.sentiment.value < -15).length;
  return [
    lead ? `最新焦點：${lead.title}` : "目前沒有符合條件的新聞。",
    topTag ? `主要趨勢：${topTag.name} 出現 ${topTag.count} 次，熱度 ${topTag.heat}。` : "尚未形成明顯趨勢標籤。",
    negative ? `風險提醒：${negative} 則新聞被判定為負面影響，建議優先複核。` : "情緒面暫無明顯負面集中訊號。"
  ];
}

function parseOpml(opml = "") {
  return [...opml.matchAll(/<outline\b([^>]*)>/gi)]
    .map((match) => {
      const attrs = match[1];
      const url = attrs.match(/\bxmlUrl=["']([^"']+)["']/i)?.[1];
      if (!url) return null;
      const name = attrs.match(/\b(?:title|text)=["']([^"']+)["']/i)?.[1] || url;
      const category = attrs.match(/\bcategory=["']([^"']+)["']/i)?.[1] || "AI";
      return { name: decodeEntities(name), url: decodeEntities(url), category };
    })
    .filter(Boolean);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function sendJson(res, value, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalized = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

await loadStore();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");

    if (url.pathname === "/api/dashboard") {
      await refreshFeeds();
      await sendJson(res, buildDashboard({
        q: url.searchParams.get("q") || "",
        category: url.searchParams.get("category") || "all",
        tag: url.searchParams.get("tag") || "all",
        filter: url.searchParams.get("filter") || "all",
        sort: url.searchParams.get("sort") || "latest",
        trendTag: url.searchParams.get("trendTag") || "",
        trendRange: url.searchParams.get("trendRange") || "24h"
      }));
      return;
    }

    if (url.pathname === "/api/refresh" && req.method === "POST") {
      const result = await refreshFeeds({ force: true });
      await sendJson(res, { ...result, dashboard: buildDashboard({}) });
      return;
    }

    if (url.pathname === "/api/daily-report" && req.method === "GET") {
      await refreshFeeds();
      await sendJson(res, { dailyReport: buildDashboard({}).dailyReport });
      return;
    }

    if (url.pathname === "/api/trends" && req.method === "GET") {
      await refreshFeeds();
      await sendJson(res, {
        trendTimeline: buildTrendTimeline({
          tag: url.searchParams.get("tag") || "",
          range: url.searchParams.get("range") || "24h"
        })
      });
      return;
    }

    if (url.pathname === "/api/marketing-tasks" && req.method === "GET") {
      await sendJson(res, { tasks: publicMarketingTasks() });
      return;
    }

    if (url.pathname === "/api/marketing-tasks" && req.method === "POST") {
      const body = await readJson(req);
      const sourceId = String(body.sourceId || "");
      const article = store.articles.get(sourceId);
      if (!article) {
        await sendJson(res, { error: "Source article not found." }, 404);
        return;
      }
      const idea = String(body.idea || article.marketing?.ideas?.[0] || article.title).trim();
      const id = body.id || taskIdFor(sourceId, idea);
      const now = new Date().toISOString();
      const existing = store.marketingTasks[id];
      store.marketingTasks[id] = {
        id,
        sourceId,
        title: String(body.title || idea).trim(),
        idea,
        type: String(body.type || article.marketing?.channels?.[0] || "內容觀察"),
        priority: body.priority || (article.marketing?.score >= 72 ? "高" : article.marketing?.score >= 48 ? "中" : "低"),
        status: body.status || existing?.status || "待處理",
        note: body.note ?? existing?.note ?? "",
        audience: body.audience ?? existing?.audience ?? "",
        cta: body.cta ?? existing?.cta ?? "",
        draft: body.draft ?? existing?.draft ?? "",
        dueDate: body.dueDate ?? existing?.dueDate ?? "",
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      await saveStore();
      await sendJson(res, { task: store.marketingTasks[id], tasks: publicMarketingTasks() });
      return;
    }

    if (url.pathname.startsWith("/api/marketing-tasks/") && url.pathname.endsWith("/export") && req.method === "GET") {
      const parts = url.pathname.split("/");
      const id = decodeURIComponent(parts[parts.length - 2]);
      const task = store.marketingTasks[id];
      if (!task) {
        await sendJson(res, { error: "Marketing task not found." }, 404);
        return;
      }
      await sendJson(res, {
        filename: `${safeFilename(task.title)}.md`,
        markdown: buildMarketingTaskMarkdown(task)
      });
      return;
    }

    if (url.pathname.startsWith("/api/marketing-tasks/") && req.method === "PATCH") {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const task = store.marketingTasks[id];
      if (!task) {
        await sendJson(res, { error: "Marketing task not found." }, 404);
        return;
      }
      const body = await readJson(req);
      store.marketingTasks[id] = {
        ...task,
        title: body.title ?? task.title,
        type: body.type ?? task.type,
        priority: body.priority ?? task.priority,
        status: body.status ?? task.status,
        note: body.note ?? task.note,
        audience: body.audience ?? task.audience ?? "",
        cta: body.cta ?? task.cta ?? "",
        draft: body.draft ?? task.draft ?? "",
        dueDate: body.dueDate ?? task.dueDate ?? "",
        updatedAt: new Date().toISOString()
      };
      await saveStore();
      await sendJson(res, { task: store.marketingTasks[id], tasks: publicMarketingTasks() });
      return;
    }

    if (url.pathname.startsWith("/api/marketing-tasks/") && req.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      delete store.marketingTasks[id];
      await saveStore();
      await sendJson(res, { deleted: id, tasks: publicMarketingTasks() });
      return;
    }

    if (url.pathname === "/api/watchlist" && req.method === "GET") {
      await sendJson(res, { watchlist: publicWatchlist() });
      return;
    }

    if (url.pathname === "/api/watchlist" && req.method === "POST") {
      const body = await readJson(req);
      const articleId = String(body.articleId || "");
      const article = store.articles.get(articleId);
      if (!article) {
        await sendJson(res, { error: "Article not found." }, 404);
        return;
      }
      const now = new Date().toISOString();
      store.watchlist[articleId] = {
        articleId,
        status: body.status || store.watchlist[articleId]?.status || "追蹤中",
        note: body.note || store.watchlist[articleId]?.note || "",
        createdAt: store.watchlist[articleId]?.createdAt || now,
        updatedAt: now
      };
      await saveStore();
      await sendJson(res, { item: store.watchlist[articleId], watchlist: publicWatchlist() });
      return;
    }

    if (url.pathname.startsWith("/api/watchlist/") && req.method === "PATCH") {
      const articleId = decodeURIComponent(url.pathname.split("/").pop());
      const item = store.watchlist[articleId];
      if (!item) {
        await sendJson(res, { error: "Watchlist item not found." }, 404);
        return;
      }
      const body = await readJson(req);
      store.watchlist[articleId] = {
        ...item,
        status: body.status || item.status,
        note: body.note ?? item.note,
        updatedAt: new Date().toISOString()
      };
      await saveStore();
      await sendJson(res, { item: store.watchlist[articleId], watchlist: publicWatchlist() });
      return;
    }

    if (url.pathname.startsWith("/api/watchlist/") && req.method === "DELETE") {
      const articleId = decodeURIComponent(url.pathname.split("/").pop());
      delete store.watchlist[articleId];
      await saveStore();
      await sendJson(res, { deleted: articleId, watchlist: publicWatchlist() });
      return;
    }

    if (url.pathname === "/api/topics" && req.method === "GET") {
      await sendJson(res, { topics: publicTopics(), priorities: Object.keys(priorityMinutes), categories: currentCategories() });
      return;
    }

    if (url.pathname === "/api/topics" && req.method === "POST") {
      const body = await readJson(req);
      const feed = upsertTopic(body);
      await saveStore();
      await sendJson(res, { topic: publicTopics().find((topic) => topic.id === feed.id), topics: publicTopics() });
      return;
    }

    if (url.pathname.startsWith("/api/topics/") && req.method === "PATCH") {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const index = feeds.findIndex((feed) => feed.id === id);
      if (index < 0) {
        await sendJson(res, { error: "Topic not found." }, 404);
        return;
      }
      const body = await readJson(req);
      const current = feeds[index];
      const updated = upsertTopic({
        name: body.name ?? current.category,
        query: body.query ?? current.query ?? current.category,
        priority: body.priority ?? current.priority,
        enabled: body.enabled ?? current.enabled
      });
      if (updated.id !== id) feeds.splice(index, 1);
      pruneArticlesToActiveTopics();
      await saveStore();
      await sendJson(res, { topic: publicTopics().find((topic) => topic.id === updated.id), topics: publicTopics() });
      return;
    }

    if (url.pathname.startsWith("/api/topics/") && req.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const index = feeds.findIndex((feed) => feed.id === id);
      if (index < 0) {
        await sendJson(res, { error: "Topic not found." }, 404);
        return;
      }
      const removedCategory = feeds[index].category;
      feeds.splice(index, 1);
      for (const [fingerprint, article] of store.articles) {
        if (article.category === removedCategory) store.articles.delete(fingerprint);
      }
      await saveStore();
      await sendJson(res, { deleted: id, topics: publicTopics() });
      return;
    }

    if (url.pathname === "/api/topics/reset" && req.method === "POST") {
      const topics = resetDefaultTopics();
      await saveStore();
      await sendJson(res, { topics });
      return;
    }

    if (url.pathname === "/api/feeds" && req.method === "GET") {
      await sendJson(res, { categories: currentCategories(), priorities: Object.keys(priorityMinutes), feeds });
      return;
    }

    if (url.pathname === "/api/feeds" && req.method === "POST") {
      const body = await readJson(req);
      if (!body.url) {
        await sendJson(res, { error: "RSS URL is required." }, 400);
        return;
      }
      const feed = {
        id: createHash("sha1").update(body.url).digest("hex").slice(0, 10),
        name: body.name || body.url,
        url: body.url,
        category: currentCategories().includes(body.category) ? body.category : "AI",
        priority: priorityMinutes[body.priority] ? body.priority : "hourly",
        enabled: true,
        lastFetchedAt: null,
        nextFetchAt: null
      };
      const index = feeds.findIndex((item) => item.id === feed.id);
      if (index >= 0) feeds[index] = feed;
      else feeds.push(feed);
      await saveStore();
      await sendJson(res, { feed });
      return;
    }

    if (url.pathname === "/api/opml" && req.method === "POST") {
      const body = await readJson(req);
      const imported = parseOpml(body.opml || "");
      for (const item of imported) {
        const id = createHash("sha1").update(item.url).digest("hex").slice(0, 10);
        if (!feeds.some((feed) => feed.id === id)) {
          feeds.push({ id, name: item.name, url: item.url, category: currentCategories().includes(item.category) ? item.category : "AI", priority: "hourly", enabled: true, lastFetchedAt: null, nextFetchAt: null });
        }
      }
      await saveStore();
      await sendJson(res, { imported: imported.length, feeds });
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    await sendJson(res, { error: error.message }, 500);
  }
}).listen(port, () => {
  console.log(`News War Room running at http://localhost:${port}`);
});
