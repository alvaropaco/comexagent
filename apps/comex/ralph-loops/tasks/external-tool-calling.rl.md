# ⚡ RALPH LOOP — External Data Tools + Daily Sync (COMEX RAG)

## 🎯 Goal
Add **controlled web search + scraping + normalization + persistence** to your agents, plus a **daily sync job** that ingests trusted sources into Mongo (vector-ready), improving answer freshness and reducing per-request scraping.

---

## 🧠 Constraints
- Reuse NestJS + Mongo Atlas (Vector Search) + existing agents
- Low cost, minimal ops
- Domain whitelist only
- Timeboxed to hours

---

## 🧱 Target Architecture

User → Orchestrator → (Router)
  ├─→ Internal RAG (Mongo hybrid search)
  └─→ External Tools (Search → Scrape/API → Normalize → Store → RAG)
                                   ↑
                               Daily Sync (cron)

---

# 🔁 LOOP 1 — Tools Module (1–2h)

## Objective
Create a **tools layer** with strict contracts.

## Tasks

[0.5h] Module scaffold

    src/tools/
      tools.module.ts
      web-search.service.ts
      web-scrape.service.ts
      normalize.service.ts
      external-data.service.ts
      allowlist.service.ts

[0.5h] Domain allowlist

    const ALLOWED = [
      'unctadstat.unctad.org',
      'wits.worldbank.org',
      'ipcnet.org',
      'vpsaspice.org',
      'comexlive.org'
    ]

    export function isAllowed(url: string) {
      return ALLOWED.some(d => url.includes(d))
    }

[0.5–1h] Timeouts + retries wrapper

    async function withTimeout(promise, ms = 5000) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ms)
      try { return await promise(ctrl.signal) }
      finally { clearTimeout(t) }
    }

## Acceptance
- Tools module compiles
- Allowlist enforced
- All calls have timeout

---

# 🔁 LOOP 2 — Web Search (0.5–1h)

## Objective
Fetch candidate URLs cheaply.

## Tasks

    // web-search.service.ts
    async search(query: string) {
      const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query)
      const html = await axios.get(url).then(r => r.data)
      const $ = cheerio.load(html)

      const results = []
      $('.result__a').each((_, el) => {
        const href = $(el).attr('href')
        if (href && isAllowed(href)) {
          results.push({ title: $(el).text(), url: href })
        }
      })
      return results.slice(0, 5)
    }

## Acceptance
- Returns ≤5 allowlisted URLs

---

# 🔁 LOOP 3 — Scraper + API Adapters (1–2h)

## Objective
Extract text reliably; prefer APIs when available.

## Tasks

[1h] Playwright scraper

    async scrape(url: string) {
      if (!isAllowed(url)) return null
      const browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      await page.goto(url, { timeout: 10000 })
      const text = await page.evaluate(() => document.body.innerText)
      await browser.close()
      return { content: text.slice(0, 6000), source: url }
    }

[0.5–1h] API adapters (when possible)
- World Bank WITS / UNCTAD endpoints → fetch JSON instead of scraping

    async fetchWits(params) {
      // call endpoint if available; else fallback to scrape
    }

## Acceptance
- Scrape returns text ≤6k chars
- API path preferred when available

---

# 🔁 LOOP 4 — Normalize → RAG Schema (0.5–1h)

## Objective
Convert raw text into **RAG-ready document**.

## Tasks

    // normalize.service.ts
    normalize(raw: string, source: string) {
      return {
        content: raw,
        summary: raw.slice(0, 240),
        metadata: {
          commodity: /coffee/i.test(raw) ? 'coffee' :
                     /pepper/i.test(raw) ? 'pepper' : null,
          topic: /price/i.test(raw) ? 'price' :
                 /export|import/i.test(raw) ? 'trade' : 'general',
          origin: extractCountry(raw),
          date: new Date().toISOString(),
          source,
          source_type: 'web'
        },
        signals: {
          price_trend: inferTrend(raw, 'price'),
          supply_trend: inferTrend(raw, 'supply')
        }
      }
    }

## Acceptance
- All docs have metadata + summary
- No empty content stored

---

# 🔁 LOOP 5 — Persistence + Embeddings (0.5–1h)

## Objective
Store normalized docs into Mongo with embeddings.

## Tasks

    async persist(doc) {
      const embedding = await embed(doc.summary || doc.content)
      await collection.insertOne({
        ...doc,
        embedding
      })
    }

- Ensure vector index exists on `embedding`

## Acceptance
- New docs searchable via vector + metadata

---

# 🔁 LOOP 6 — Router Integration (1h)

## Objective
Decide when to call external tools vs internal RAG.

## Tasks

    function needsExternal(query: string) {
      return /today|latest|current|now|recent/i.test(query)
    }

    async handle(query: string) {
      const ctx = await parseQuery(query)

      if (needsExternal(query)) {
        const urls = await webSearch.search(query)
        if (!urls.length) return internalRag(query, ctx)

        const page = await webScrape.scrape(urls[0].url)
        if (!page) return internalRag(query, ctx)

        const doc = normalize(page.content, urls[0].url)
        await persist(doc)

        return llmAnswer(query, [doc])
      }

      const docs = await mongoHybrid(query, ctx)
      return llmAnswer(query, docs)
    }

## Acceptance
- External path triggers only when needed
- Falls back to internal RAG on failures

---

# 🔁 LOOP 7 — Daily Sync Job (1–2h)

## Objective
Pre-ingest trusted sources once per day.

## Tasks

[0.5h] Install scheduler

    npm install @nestjs/schedule

[0.5h] Cron job

    // sync.service.ts
    @Cron('0 3 * * *') // 3 AM daily
    async dailySync() {
      const queries = [
        'coffee price Brazil latest',
        'pepper Vietnam export report',
        'coffee logistics Santos congestion',
        'global coffee supply forecast'
      ]

      for (const q of queries) {
        const urls = await webSearch.search(q)
        for (const r of urls.slice(0, 2)) {
          const page = await webScrape.scrape(r.url)
          if (!page) continue

          const doc = normalize(page.content, r.url)

          if (await isDuplicate(doc)) continue

          await persist(doc)
        }
      }
    }

[0.5–1h] Deduplication

    async function isDuplicate(doc) {
      const hash = sha1(doc.summary)
      return !!(await collection.findOne({ hash }))
    }

## Acceptance
- Runs daily
- Inserts only new docs
- Improves next-day answers

---

# 🔁 LOOP 8 — Cache + Limits (0.5–1h)

## Objective
Control cost and latency.

## Tasks

    const key = sha1(query + JSON.stringify(ctx))
    const cached = await redis.get(key)
    if (cached) return cached

    const resp = await pipeline(query)
    await redis.set(key, resp, 'EX', 3600)

- Limit:
  - top_k = 5
  - max context size

## Acceptance
- Cache hit rate improves
- Stable latency

---

# 🔁 LOOP 9 — Observability (0.5h)

## Objective
Track tool usage and failures.

## Tasks

- Log:
  - tool_called (search/scrape/api)
  - latency
  - success/failure
- Basic metrics (counts per day)

## Acceptance
- You can see when/why tools were used

---

# 🚀 Final Execution Flow

    async function pipeline(query) {
      const ctx = await parseQuery(query)

      if (needsExternal(query)) {
        const urls = await webSearch.search(query)
        const page = urls[0] ? await webScrape.scrape(urls[0].url) : null

        if (page) {
          const doc = normalize(page.content, urls[0].url)
          await persist(doc)
          return llmAnswer(query, [doc])
        }
      }

      const docs = await mongoHybrid(query, ctx)
      return llmAnswer(query, docs)
    }

---

# ⏱️ Estimate

Tools module: 1–2h  
Search + scrape: 1–2h  
Normalize + persist: 1h  
Router integration: 1h  
Daily sync job: 1–2h  
Cache + polish: 0.5–1h  

TOTAL: ~5–9 hours

---

# 🎯 Key Outcomes

- Controlled external data ingestion (on-demand + daily)
- Higher freshness for market answers
- Reduced repeated scraping (store once, reuse)
- Maintains low cost and simple ops

---

# 🧠 Minimum Viable Cut (if time is tight)

Implement ONLY:
1) Search + Scrape  
2) Normalize + Persist  
3) Router gating  
4) Daily cron (2–3 queries)

→ You’ll already see a significant quality jump
