from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Dict, List, Optional, Tuple

import httpx

from apps.rag.query_context import QueryContext, parse_query_context
from libs.comex_common.core_data_api.client import get_core_data_api_client


_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_CACHE_TTL_S = 3600

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RetrievalResult:
    docs: List[Dict[str, Any]]
    confidence: float
    top_similarity: float
    result_count: int
    filter_match_ratio: float
    ctx: QueryContext
    merged_filter: Dict[str, Any]
    used_cache: bool

    @property
    def has_market_data(self) -> bool:
        for d in self.docs:
            meta = d.get("metadata")
            if isinstance(meta, dict) and meta.get("type") == "market_data":
                return True
        return False

    @property
    def has_market_data_for_query(self) -> bool:
        for d in self.docs:
            meta = d.get("metadata")
            if not isinstance(meta, dict) or meta.get("type") != "market_data":
                continue
            if self.ctx.commodity and meta.get("commodity") != self.ctx.commodity:
                continue
            return True
        return False


_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "market",
    "markets",
    "me",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "today",
    "trend",
    "trends",
    "we",
    "what",
    "when",
    "where",
    "why",
    "with",
}


def _normalize_query(query: str) -> str:
    q = (query or "").lower()
    tokens = re.findall(r"[a-z0-9]+", q)
    tokens = [t for t in tokens if t not in _STOPWORDS and len(t) >= 3]
    return " ".join(tokens[:32])


def _cache_key(*, query: str, ctx: QueryContext, base_filter: Optional[dict], k: int) -> str:
    payload = {"q": _normalize_query(query), "ctx": asdict(ctx), "f": base_filter, "k": k}
    return sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _maybe_get_cache(key: str) -> Optional[List[Dict[str, Any]]]:
    item = _CACHE.get(key)
    if not item:
        return None
    ts, value = item
    if time.time() - ts > _CACHE_TTL_S:
        _CACHE.pop(key, None)
        return None
    return value


def _set_cache(key: str, value: List[Dict[str, Any]]) -> None:
    _CACHE[key] = (time.time(), value)


def _parse_date(value: object) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    v = value.strip()
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def _recency_score(meta: dict) -> float:
    dt = _parse_date(meta.get("date") or meta.get("fetchedAt") or meta.get("ingestedAt"))
    if dt is None:
        return 0.0
    age_days = max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0)
    decay = 90.0
    return max(0.0, min(1.0, pow(2.718281828, -age_days / decay)))


def _extract_similarity(doc: Dict[str, Any]) -> float:
    try:
        s = float(doc.get("score") or 0.0)
    except Exception:
        s = 0.0
    return max(0.0, min(1.0, s))


def _filter_match_ratio_for_doc(meta: dict, expected: dict) -> float:
    if not expected:
        return 1.0
    matched = 0
    total = 0
    for k, v in expected.items():
        if not k.startswith("metadata."):
            continue
        total += 1
        meta_key = k.split("metadata.", 1)[1]
        if meta.get(meta_key) == v:
            matched += 1
    if total == 0:
        return 1.0
    return matched / total


def _rerank_score(doc: Dict[str, Any], expected_filter: dict) -> float:
    meta = doc.get("metadata")
    if not isinstance(meta, dict):
        meta = {}
    similarity = _extract_similarity(doc)
    recency = _recency_score(meta)
    match = _filter_match_ratio_for_doc(meta, expected_filter)
    return 0.6 * similarity + 0.3 * recency + 0.1 * match


def _merge_unique(primary: List[Dict[str, Any]], secondary: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out: List[Dict[str, Any]] = []
    for d in primary + secondary:
        key = (d.get("_id") or "") + "|" + (d.get("text") or "")[:80]
        if key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out


def retrieve_context_docs(
    *,
    query: str,
    base_filter: Optional[dict] = None,
    k: int = 10,
) -> List[Dict[str, Any]]:
    return retrieve_context(query=query, base_filter=base_filter, k=k).docs


def retrieve_context(
    *,
    query: str,
    base_filter: Optional[dict] = None,
    k: int = 10,
) -> RetrievalResult:
    core = get_core_data_api_client()
    if core is None:
        return RetrievalResult(
            docs=[],
            confidence=0.0,
            top_similarity=0.0,
            result_count=0,
            filter_match_ratio=0.0,
            ctx=parse_query_context(query),
            merged_filter={},
            used_cache=False,
        )

    ctx = parse_query_context(query)
    dynamic = ctx.to_filter()
    merged_filter: dict = {}
    if isinstance(base_filter, dict):
        merged_filter.update(base_filter)
    merged_filter.update(dynamic)

    cache_key = _cache_key(query=query, ctx=ctx, base_filter=merged_filter, k=k)
    cached = _maybe_get_cache(cache_key)
    if cached is not None:
        top = _extract_similarity(cached[0]) if cached else 0.0
        match_ratio = _overall_filter_match_ratio(docs=cached, expected_filter=dynamic)
        confidence = _confidence(top_similarity=top, result_count=len(cached), filter_match_ratio=match_ratio)
        logger.info("rag_retrieval", extra={"confidence": confidence, "cached": True, "result_count": len(cached)})
        return RetrievalResult(
            docs=cached,
            confidence=confidence,
            top_similarity=top,
            result_count=len(cached),
            filter_match_ratio=match_ratio,
            ctx=ctx,
            merged_filter=merged_filter,
            used_cache=True,
        )

    filtered_docs = _vector_search_safe(core=core, query=query, k=k, filter=merged_filter)
    docs = filtered_docs
    if len(filtered_docs) < 3:
        unfiltered_docs = _vector_search_safe(core=core, query=query, k=k, filter=base_filter)
        docs = _merge_unique(filtered_docs, unfiltered_docs)

    docs_sorted = sorted(docs, key=lambda d: _rerank_score(d, dynamic), reverse=True)[: min(5, len(docs))]
    _set_cache(cache_key, docs_sorted)

    top = _extract_similarity(docs_sorted[0]) if docs_sorted else 0.0
    match_ratio = _overall_filter_match_ratio(docs=docs_sorted, expected_filter=dynamic)
    confidence = _confidence(top_similarity=top, result_count=len(docs_sorted), filter_match_ratio=match_ratio)

    if confidence < float(os.getenv("COMEX_EXTERNAL_MIN_CONFIDENCE", "0.35")) and _needs_external(query):
        try:
            _trigger_external_ingest_fast(
                base_url=core.base_url,
                token=os.getenv("EXTERNAL_TOOL_TOKEN"),
                query=query,
                force=_is_historical_query(query),
                timeout_s=float(os.getenv("COMEX_EXTERNAL_INGEST_TIMEOUT_S", "4")),
            )
        except Exception:
            pass

        refreshed = _vector_search_safe(core=core, query=query, k=k, filter=merged_filter)
        if refreshed:
            docs_sorted = sorted(
                refreshed,
                key=lambda d: _rerank_score(d, dynamic),
                reverse=True,
            )[: min(5, len(refreshed))]
            _set_cache(cache_key, docs_sorted)
            top = _extract_similarity(docs_sorted[0]) if docs_sorted else 0.0
            match_ratio = _overall_filter_match_ratio(docs=docs_sorted, expected_filter=dynamic)
            confidence = _confidence(
                top_similarity=top,
                result_count=len(docs_sorted),
                filter_match_ratio=match_ratio,
            )
    logger.info(
        "rag_retrieval",
        extra={
            "confidence": confidence,
            "cached": False,
            "result_count": len(docs_sorted),
            "top_similarity": top,
            "filter_match_ratio": match_ratio,
        },
    )

    return RetrievalResult(
        docs=docs_sorted,
        confidence=confidence,
        top_similarity=top,
        result_count=len(docs_sorted),
        filter_match_ratio=match_ratio,
        ctx=ctx,
        merged_filter=merged_filter,
        used_cache=False,
    )


def _needs_external(query: str) -> bool:
    q = (query or "").lower()
    if re.search(r"\b(today|latest|current|now|recent|this\s+week)\b", q):
        return True
    if _is_historical_query(q) and re.search(r"\b(export|exports|import|imports|trade|shipment|shipments|volume|volumes)\b", q):
        return True
    return False


def _is_historical_query(query: str) -> bool:
    q = (query or "").lower()
    return bool(re.search(r"\b(historical|history|since\s+\d{4}|in\s+\d{4}|last\s+year|years)\b", q))


def _trigger_external_ingest_fast(
    *,
    base_url: str,
    token: Optional[str],
    query: str,
    force: bool,
    timeout_s: float,
) -> None:
    if not base_url:
        return
    headers: Dict[str, str] = {}
    if token:
        headers["x-external-tool-token"] = token

    url = f"{base_url}/external/ingest"
    with httpx.Client(timeout=max(0.5, timeout_s)) as c:
        r = c.post(url, json={"query": query, "force": bool(force)}, headers=headers)
        if r.status_code >= 400:
            raise RuntimeError(f"external_ingest_http_{r.status_code}")


def _vector_search_safe(*, core, query: str, k: int, filter: Optional[dict]) -> List[Dict[str, Any]]:
    try:
        res = core.vector_search(query=query, k=k, filter=filter)
        data = res.get("data") if isinstance(res, dict) else res
        if not isinstance(data, list):
            return []
        return [d for d in data if isinstance(d, dict)]
    except Exception:
        return []


def _overall_filter_match_ratio(*, docs: List[Dict[str, Any]], expected_filter: dict) -> float:
    if not expected_filter:
        return 1.0
    ratios: List[float] = []
    for d in docs:
        meta = d.get("metadata")
        if not isinstance(meta, dict):
            meta = {}
        ratios.append(_filter_match_ratio_for_doc(meta, expected_filter))
    if not ratios:
        return 0.0
    return sum(ratios) / len(ratios)


def _confidence(*, top_similarity: float, result_count: int, filter_match_ratio: float) -> float:
    return max(
        0.0,
        min(
            1.0,
            0.5 * top_similarity + 0.3 * min(result_count / 5.0, 1.0) + 0.2 * filter_match_ratio,
        ),
    )


def format_docs(docs: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for i, item in enumerate(docs, start=1):
        meta = item.get("metadata")
        text = item.get("text")
        score = item.get("score")
        lines.append(f"[{i}] score={score} metadata={meta} text={text}")
    return "\n".join(lines).strip()
