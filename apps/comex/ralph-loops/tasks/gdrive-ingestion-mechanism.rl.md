# 🎯 Objective
Implement a **Google Drive ingestion pipeline** that:
- Imports files from Google Drive
- Parses, chunks, and embeds content into Mongo Atlas Vector Search
- Runs a **daily sync job** to ingest new/updated files
- Enriches metadata to integrate with existing RAG filters (`commodity`, `origin`, `topic`, `date`)

---

# 🧩 Scope of Work

## 1. Google Drive Integration (Backend)

### Requirements
- Use OAuth2 with scope:
  - `https://www.googleapis.com/auth/drive.readonly`
- Store access token securely (env or DB)

### Tasks
- Implement `gdrive.service`:
  - `listFiles(folderId)`
  - `getFileMetadata(fileId)`
  - `downloadFile(fileId)`

### Acceptance Criteria
- Can fetch files from a configured folder
- Supports pagination and incremental fetch

---

## 2. Daily Sync Job

### Requirements
- Runs **once per day**
- Fetches:
  - new files
  - updated files (based on `modifiedTime`)

### Tasks
- Create job `gdrive_sync_job`
- Use scheduler:
  - Node: cron / BullMQ / Cloud Scheduler
- Persist last sync timestamp

### Logic
```

load lastSyncAt
files = listFiles(updatedAfter=lastSyncAt)

for file in files:
process(file)

update lastSyncAt

```

### Acceptance Criteria
- Only new/updated files are processed
- Job is idempotent (safe to rerun)

---

## 3. File Processing Pipeline

### Requirements
Support:
- PDF
- XLSX
- CSV
- DOCX

### Tasks
- Implement `parser.service`:
  - extract raw text
- Implement chunking:
```

chunk(text, size=500, overlap=50)

```

### Acceptance Criteria
- Files converted into clean text chunks
- Handles large files safely

---

## 4. Embedding + Storage

### Requirements
- Use existing embedding provider
- Store in Mongo Atlas Vector Search

### Tasks
- Implement `embedding.service`
- Store documents:

```

{
"text": "...",
"embedding": [...],
"metadata": {
"source": "gdrive",
"fileId": "...",
"fileName": "...",
"commodity": "...",
"origin": "...",
"topic": "...",
"date": "...",
"updatedAt": "..."
}
}

```

### Acceptance Criteria
- Chunks are searchable via existing RAG pipeline
- Metadata aligns with current filters

---

## 5. Metadata Enrichment

### Requirements
Extract:
- `commodity`
- `origin`
- `topic`
- `date`

### Tasks
- Use:
  - filename patterns (e.g. DTYYYYMMDD)
  - simple NLP or LLM fallback

### Acceptance Criteria
- Metadata improves retrieval quality
- Works with existing query filters

---

## 6. Deduplication

### Requirements
Avoid re-embedding same content

### Tasks
- Generate hash:
```

hash = sha256(fileId + modifiedTime)

```
- Skip if already processed

### Acceptance Criteria
- No duplicate embeddings
- Updates reprocess correctly

---

## 7. Integration with Existing RAG

### Requirements
- No changes to retrieval pipeline needed
- Ensure compatibility with:
  - filters
  - reranking
  - grounding

### Tasks
- Tag all docs with:
```

metadata.source = "gdrive"

```

### Acceptance Criteria
- Queries can retrieve Drive data seamlessly

---

## 8. Observability

### Tasks
- Log:
  - files processed
  - chunks created
  - errors
- Add basic metrics:
  - ingestion count/day
  - failures

---

# 🧪 Testing Requirements

- Unit tests:
  - parser
  - metadata extraction
  - dedup logic
- Integration test:
  - ingest file → query retrieves it
- Simulate daily sync:
  - ensure only new files processed

---

# 🚫 Constraints

- DO NOT introduce new infrastructure
- MUST reuse:
  - Mongo Atlas Vector Search
  - existing embedding pipeline
- Keep implementation lightweight

---

# 📦 Deliverables

- `gdrive.service`
- `gdrive_sync_job`
- `parser.service`
- updates to embedding pipeline
- tests

---

# ⏱️ Execution Plan

1. Implement Drive API access  
2. Build ingestion pipeline (parse → chunk → embed)  
3. Add deduplication  
4. Implement daily sync job  
5. Add metadata enrichment  
6. Test end-to-end  

---

# ✅ Definition of Done

- Files from Google Drive are ingested daily  
- Only new/updated files are processed  
- Data is searchable via RAG  
- No duplicate embeddings  
- All tests passing  
