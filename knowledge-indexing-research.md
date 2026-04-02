# Research: Building an Agent-Native Scientific Knowledge Base

**Date:** March 2025
**Status:** Research complete. Opportunity identified. Next: Explore "computation on knowledge" concept.

---

## 1. The Original Hypothesis

**Question:** Is it feasible to index and vectorize all human scientific knowledge, making it easily accessible for AI agents doing research?

**Initial assumptions:**
- This would require massive infrastructure
- Legal issues would be significant
- We'd need to scrape/aggregate from many sources
- Cost would be prohibitive

**What we found:** The infrastructure largely exists already. The real question isn't "can we index the data" — it's "what can we do with it that others can't?"

---

## 2. The Landscape: What Already Exists

### Major Open Databases

| Database | Works | Embeddings | Semantic Search | Open? |
|----------|-------|------------|-----------------|-------|
| **OpenAlex** | 271M | No (but has semantic search API) | Yes ($0.001/q) | Fully open |
| **Semantic Scholar** | 200M | Yes (SPECTER2) | Yes | Open API |
| **CORE** | 46M full texts | No | No | Open |

### Key Insight

**~80% of scientific knowledge is already indexed and freely accessible.** The 80/20 sources:
- OpenAlex (271M works, fully open, monthly snapshots)
- Semantic Scholar (200M works, pre-computed embeddings)
- CORE (46M full texts)
- arXiv (2.4M preprints)
- PubMed Central (8M+ biomedical full texts)

### What These Systems Provide

| Capability | Available? |
|------------|------------|
| Search papers by keyword | Yes (all) |
| Semantic/similarity search | Yes (OpenAlex, S2) |
| Citation data | Yes (all) |
| Author/institution data | Yes (all) |
| Abstracts | ~60% of papers |
| Full text (PDFs) | 60M via OpenAlex, 46M via CORE |
| Pre-computed embeddings | Yes (S2 only) |
| Bulk downloads | Yes (all) |

---

## 3. Deep Dive: OpenAlex

OpenAlex emerged as the most promising foundation. Here's what we learned:

### What It Is

- **Run by:** OurResearch (nonprofit, founded 2011)
- **Funding:** Arcadia Fund (~$12M total), Sloan Foundation, NSF, French government
- **Origin:** Built to replace Microsoft Academic Graph when Microsoft shut it down (2021)
- **Scale:** 271M works, 250K+ sources, 90M+ authors, 50K new works/day

### Data Sources

Primary: Microsoft Academic Graph (legacy) + Crossref (ongoing)
Secondary: PubMed, arXiv, DataCite, DOAJ, ORCID, institutional repositories, 60M parsed PDFs

### What's Covered vs. Missing

| Covered | Missing/Weak |
|---------|--------------|
| Journal articles | 40% lack abstracts |
| Conference papers | 64% have zero references |
| Preprints | Patents (not covered) |
| Some books/theses | Chinese papers (CNKI) |
| 60M open-access PDFs | Non-English metadata accuracy |

### API Capabilities

| Feature | Supported? | Notes |
|---------|------------|-------|
| Keyword search | Yes | Across title, abstract, fulltext |
| Semantic search | Yes | $0.001/query, max 50 results, 1 RPS |
| Filters (year, OA, venue, etc.) | Yes | Rich filtering with AND/OR logic |
| Citation filters | Yes | `cites:` and `cited_by:` |
| Combine semantic + filters | Yes | Can do temporal + semantic queries |
| Bulk downloads | Yes | Monthly snapshots, free |
| PDF downloads | Yes | 60M available, $0.01 each |

### Sustainability

- $7.5M grant (2024) provides runway through ~2029
- Freemium model (OpenAlex Premium) generating revenue
- Same team runs Unpaywall (self-sustaining for 5+ years)
- Committed to POSI principles (open infrastructure governance)

---

## 4. Our Target Use Cases

We defined four core capabilities an agent-native system would need:

| Use Case | OpenAlex Support? |
|----------|-------------------|
| **Batch similarity search** (50 related papers in one call) | Partial — 50 results per query, but one query at a time |
| **Structured filters + semantic search** | Yes — fully supported |
| **Citation graph traversal** ("papers citing X and cited by Y") | Yes — filter combinations |
| **Temporal queries** ("papers from 2020-2023 about X") | Yes — year range + semantic |

### The Gaps We Found

| Gap | Description |
|-----|-------------|
| **Multi-seed similarity** | "Find papers similar to these 50 papers" requires 50 API calls |
| **Multi-hop graph traversal** | "Papers 2-3 hops away in citation graph" requires sequential calls |
| **Batch embedding retrieval** | Can't get embeddings for N papers efficiently |
| **Passage-level RAG** | Returns whole abstracts/PDFs, not relevant chunks |
| **Computation on data** | No server-side analysis — fetch data, compute locally |

---

## 5. The Core Question: Is OpenAlex Enough?

### For Basic Agent Use Cases: Yes

If your agents need to:
- Find papers on a topic → OpenAlex semantic search
- Filter by year, venue, citations → OpenAlex filters
- Get abstracts for context → OpenAlex API
- Follow citation chains (shallow) → OpenAlex cites/cited_by

**OpenAlex covers this. No need to build anything.**

### For Deep, Autonomous Research: No

OpenAlex is a **database with an API**, not an **agent platform**.

| What OpenAlex provides | What deep research agents need |
|------------------------|-------------------------------|
| Request → Response | Iterative exploration |
| One query at a time | Parallel, high-throughput |
| Stateless | Session/workspace state |
| "Find papers matching X" | "Explore this space, find what's interesting" |
| Return data | Compute on data |
| Human-speed (rate limits) | Machine-speed |
| Shallow (1 hop per call) | Deep (recursive, multi-hop) |

---

## 6. Conclusion: The Opportunity

### What's NOT Worth Building

- Another paper search API (OpenAlex/S2 exist)
- A wrapper around existing APIs (adds no value)
- A "bigger database" (OpenAlex has 271M works, freely available)

### What IS Potentially Worth Building

An **agent-native computation layer** on top of existing data:

| Primitive | What it enables |
|-----------|-----------------|
| **Server-side computation** | "Cluster papers in field X" without downloading everything |
| **Deep graph traversal** | "Explore 3 hops in citation graph" in one query |
| **Batch operations** | "Get embeddings for 500 papers" efficiently |
| **Research workflows** | "Find gaps / trace lineage / compare methods" as primitives |
| **Stateful sessions** | "Continue exploring from where I left off" |

### The One-Liner

> The opportunity isn't in having the data — it's in enabling **computation on the data** that agents can't efficiently do today.

---

## 7. Key Numbers

| Metric | Value |
|--------|-------|
| Total scientific papers (estimated) | 200-270M |
| OpenAlex coverage | 271M works |
| Papers with abstracts | ~60% |
| Open access full texts | 60M (OpenAlex) + 46M (CORE) |
| New papers per year | 3-5M |
| Cost of OpenAlex semantic search | $0.001/query |
| Cost of PDF downloads | $0.01/file |
| Self-hosted infra (estimated) | $300-500/mo |

---

## 8. Legal Summary

| Safe | Risky |
|------|-------|
| Using OpenAlex/S2 APIs | Redistributing paywalled PDFs |
| Downloading open datasets | Bypassing paywalls |
| Storing metadata + embeddings | Hosting copyrighted full text |
| Linking to sources | Sci-Hub style access |

**Recommendation:** Build on open data (OpenAlex, S2ORC, CORE). Don't host or redistribute copyrighted content.

---

## 9. What's Next

**Decided:** The basic "index all papers" idea is solved. OpenAlex + Semantic Scholar cover it.

**To explore:** The "computation on knowledge" concept — enabling agents to run analysis on the knowledge graph rather than just querying it.

Questions to answer:
1. What computation primitives would agents actually use?
2. What would the architecture look like?
3. Is this a product, open-source project, or research tool?
4. Who would pay for this (if anyone)?

---

## Sources

- [OpenAlex](https://openalex.org/) — Primary open database
- [OpenAlex Documentation](https://docs.openalex.org/)
- [Semantic Scholar](https://www.semanticscholar.org/) — Embeddings + API
- [S2ORC Dataset](https://github.com/allenai/s2orc) — Open research corpus
- [CORE](https://core.ac.uk/) — Full text aggregator
- [OurResearch](https://ourresearch.org/) — Nonprofit behind OpenAlex
- [SPECTER2](https://huggingface.co/allenai/specter2) — Scientific paper embeddings
- [Arcadia Fund](https://www.arcadiafund.org.uk/) — Primary OpenAlex funder
