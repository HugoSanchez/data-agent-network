# Exploration: Semantic Discovery & Schema Agnosticism

**Questions we're exploring:**
1. How can agents discover resources using natural language, not rigid queries?
2. Can providers use any data format/schema they want?
3. What's the simplest possible version of this (no payments)?

---

## 1. The Problem with Traditional Approaches

### Rigid Discovery

Traditional systems require exact matches:
```
# Old way: keyword/category matching
GET /resources?category=biology&subcategory=genetics&topic=crispr

# Problem: What if someone labeled it "gene editing" instead of "crispr"?
# Problem: What if the taxonomy doesn't have a category for what you want?
```

### Rigid Schemas

Traditional data integration requires schema alignment:
```
# Old way: everyone must conform to THE schema
{
  "title": string,
  "abstract": string,
  "authors": [Author],
  "doi": string,
  ...
}

# Problem: What about data that doesn't fit this shape?
# Problem: Who decides the schema? Who updates it?
# Problem: Providers have to transform their data
```

---

## 2. Semantic Discovery (Natural Language)

### The Idea

Instead of matching keywords or categories, match **meaning**.

```
Agent: "What resources exist for CRISPR delivery mechanisms?"

Network: [
  {
    provider: "node-A",
    description: "Scientific papers on gene editing and therapy",
    relevance: 0.89
  },
  {
    provider: "node-B",
    description: "Biotech patent filings",
    relevance: 0.76
  },
  {
    provider: "node-C",
    description: "Clinical trial data for genetic therapies",
    relevance: 0.82
  }
]
```

The agent said "CRISPR delivery mechanisms."
- Node-A's description says "gene editing and therapy" — semantically related, high match
- Node-C says "genetic therapies" — also related
- Node-B mentions "biotech patents" — somewhat related

No one had to use the exact words "CRISPR delivery mechanisms."

### How It Works

**Each provider publishes:**
```
{
  "node_id": "abc123",
  "name": "OpenAlex Papers",
  "description": "Scientific papers across all fields of research,
                  including medicine, biology, physics, computer science,
                  social sciences, and humanities. Includes abstracts,
                  citations, author information, and institutional data.",
  "description_embedding": [0.023, -0.156, 0.892, ...],  // Vector
  "capabilities": ["semantic_search", "citation_traversal", "filtering"],
  "sample_queries": [
    "Find papers about machine learning in healthcare",
    "Who are the top authors in quantum computing?",
    "What papers cite this work?"
  ]
}
```

**When an agent searches:**
1. Agent's query → embedded into vector
2. Compare against all providers' `description_embedding`
3. Return ranked list by semantic similarity
4. (Optionally) also match against `sample_queries` for finer relevance

### The Discovery Index

```
┌─────────────────────────────────────────────────────────────────┐
│                    DISCOVERY LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Provider descriptions stored as:                              │
│   ┌────────────────────────────────────────┐                   │
│   │  node_id: "abc123"                     │                   │
│   │  description: "Scientific papers..."    │                   │
│   │  embedding: [0.02, -0.15, ...]         │◄── Vector index   │
│   │  capabilities: [...]                    │                   │
│   └────────────────────────────────────────┘                   │
│                                                                  │
│   Agent query: "CRISPR delivery"                                │
│                    │                                             │
│                    ▼                                             │
│            ┌──────────────┐                                     │
│            │ Embed query  │                                     │
│            └──────┬───────┘                                     │
│                   │                                              │
│                   ▼                                              │
│         ┌─────────────────┐                                     │
│         │ Vector search   │                                     │
│         │ against all     │                                     │
│         │ provider embeds │                                     │
│         └────────┬────────┘                                     │
│                  │                                               │
│                  ▼                                               │
│         Ranked list of relevant providers                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Benefits

| Benefit | Why It Matters |
|---------|----------------|
| No taxonomy needed | Don't have to agree on categories upfront |
| Language agnostic | Query in English, find Spanish resources (if embeddings are multilingual) |
| Fuzzy matching | "CRISPR" matches "gene editing" matches "genetic modification" |
| Easy to add providers | Just describe what you have in natural language |
| Evolves naturally | New topics don't need new categories |

---

## 3. Schema Agnosticism

### The Key Insight

**Don't standardize schemas. Standardize capabilities.**

Instead of saying "everyone must have a `papers` table with these columns," say:
- "I can answer natural language questions about my data"
- "I can do semantic search"
- "I can filter by date ranges"
- "I can traverse relationships"

The agent says WHAT they want. The provider figures out HOW.

### Capability-Based Interface

```yaml
# Provider declares capabilities, not schema
capabilities:
  - name: "semantic_search"
    input:
      query: "natural language string"
      limit: "integer (optional)"
    output:
      results: "list of items with relevance scores"
    description: "Find items semantically similar to the query"

  - name: "filter"
    input:
      conditions: "natural language or structured conditions"
    output:
      results: "filtered items"
    description: "Filter items by conditions"

  - name: "aggregate"
    input:
      group_by: "field or concept"
      metric: "count, sum, average, etc."
    output:
      aggregation: "grouped statistics"
    description: "Compute statistics over the data"
```

### Natural Language as the Interface

Here's the radical idea: **the query interface is natural language, interpreted by the provider**.

```
# Agent sends natural language request
Agent → Provider: {
  "request": "Find papers about CRISPR published after 2020 with more than 50 citations,
              focusing on delivery mechanisms using lipid nanoparticles"
}

# Provider (with LLM or custom logic) interprets and executes
Provider internal:
  - Parse intent: semantic search + filters
  - Query: "CRISPR delivery mechanisms lipid nanoparticles"
  - Filters: year > 2020, citations > 50
  - Execute against local DB (whatever format it is)

# Provider returns results in a common format
Provider → Agent: {
  "results": [
    { "id": "...", "title": "...", "snippet": "...", "relevance": 0.92 },
    ...
  ],
  "metadata": { "total_matches": 847, "returned": 50 }
}
```

### Why This Works

The provider knows their data best. They can:
- Use SQL, MongoDB, Elasticsearch, flat files — whatever
- Map natural language to their internal representation
- Return results in a simple common format

The agent doesn't need to know:
- What database the provider uses
- What the internal schema looks like
- How fields are named internally

### Common Response Format (Minimal)

We need SOME standardization for responses, but it can be minimal:

```yaml
# The only thing we standardize: response format
response:
  results:
    - id: string           # Provider's internal ID
      content: object      # Flexible — provider decides what to include
      relevance: float     # Optional — for ranked results
      snippet: string      # Optional — preview text
  metadata:
    total: integer
    has_more: boolean
    cursor: string         # For pagination
```

The `content` object is **completely flexible**. A paper provider might return:
```json
{ "title": "...", "abstract": "...", "authors": [...] }
```

A clinical trial provider might return:
```json
{ "trial_id": "...", "condition": "...", "phase": 3, "enrollment": 500 }
```

A financial data provider might return:
```json
{ "ticker": "AAPL", "date": "2024-01-15", "close": 182.50 }
```

**Agents handle the heterogeneity.** They're good at that — they can read and understand varied formats.

---

## 4. Handling Heterogeneity

### How Agents Cope with Different Schemas

Modern LLM-based agents are actually great at this:

```
Agent receives:
[
  { "title": "Gene Editing with CRISPR", "abstract": "...", "year": 2023 },
  { "name": "CRISPR Patent #12345", "filing_date": "2023-03-15", "claims": [...] },
  { "trial_name": "Phase 2 CRISPR Study", "status": "recruiting", "n_participants": 200 }
]

Agent understands: These are three different types of results about CRISPR:
- A paper
- A patent
- A clinical trial

Agent can synthesize across them despite different schemas.
```

### Provider Self-Description

Providers can describe their data structure in natural language:

```yaml
provider:
  name: "Clinical Trials Database"
  description: "Clinical trial registrations and results for drug and therapy studies"

  data_description: |
    Each record represents a clinical trial with:
    - Trial identifier and registration info
    - Medical condition being studied
    - Intervention (drug, therapy, device)
    - Study phase (1-4)
    - Enrollment numbers and eligibility criteria
    - Status (recruiting, completed, terminated)
    - Results if available (efficacy, adverse events)

  example_record: |
    {
      "trial_id": "NCT04191486",
      "condition": "Sickle Cell Disease",
      "intervention": "CRISPR-Cas9 gene editing",
      "phase": 2,
      "enrollment": 45,
      "status": "active"
    }
```

Agents can read this description and understand what to expect.

---

## 5. Simplest Possible Version (No Payments)

Let's design the MVP — absolute minimum to demonstrate the idea.

### What We're Building

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIMPLE VERSION                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐                 │
│   │ Node 1   │    │ Node 2   │    │ Node 3   │                 │
│   │ (Papers) │    │ (Patents)│    │ (Trials) │                 │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘                 │
│        │               │               │                        │
│        └───────────────┼───────────────┘                        │
│                        │                                         │
│              ┌─────────▼─────────┐                              │
│              │  Discovery Node   │  ← Knows about all providers │
│              │  (just a list +   │                              │
│              │   vector index)   │                              │
│              └─────────┬─────────┘                              │
│                        │                                         │
│              ┌─────────▼─────────┐                              │
│              │     Agent         │                              │
│              └───────────────────┘                              │
│                                                                  │
│   No payments. No blockchain. No complex P2P.                   │
│   Just: discover → query → get results.                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Provider Node

A simple HTTP server that:
- Publishes a description (text + embedding)
- Accepts natural language queries
- Returns results

```python
# Minimal provider node (pseudocode)
class ProviderNode:
    def __init__(self, name, description, data_source):
        self.name = name
        self.description = description
        self.embedding = embed(description)  # Pre-compute
        self.data = data_source

    def get_manifest(self):
        """Return info about this node for discovery"""
        return {
            "name": self.name,
            "description": self.description,
            "embedding": self.embedding,
            "endpoint": self.url,
            "capabilities": ["semantic_search", "filter"]
        }

    def query(self, natural_language_request):
        """Handle a query — interpret and execute"""
        # Use LLM or custom logic to interpret the request
        intent = self.interpret(natural_language_request)
        results = self.execute(intent)
        return results
```

#### 2. Discovery Service

A simple index of all providers:

```python
# Minimal discovery service (pseudocode)
class DiscoveryService:
    def __init__(self):
        self.providers = []  # List of provider manifests
        self.embeddings = []  # Their embeddings for search

    def register(self, manifest):
        """Provider announces itself"""
        self.providers.append(manifest)
        self.embeddings.append(manifest["embedding"])

    def search(self, query):
        """Find relevant providers for a query"""
        query_embedding = embed(query)
        similarities = cosine_similarity(query_embedding, self.embeddings)
        ranked = sorted(zip(self.providers, similarities), key=lambda x: -x[1])
        return [{"provider": p, "relevance": s} for p, s in ranked]
```

#### 3. Agent SDK

Simple client for agents:

```python
# Minimal agent SDK (pseudocode)
class AgentClient:
    def __init__(self, discovery_url):
        self.discovery = discovery_url

    def find_resources(self, query):
        """Discover relevant providers"""
        response = http_get(f"{self.discovery}/search?q={query}")
        return response["providers"]

    def query_provider(self, provider_url, request):
        """Query a specific provider"""
        response = http_post(f"{provider_url}/query", {"request": request})
        return response["results"]

    def research(self, question):
        """High-level: find providers and query them"""
        providers = self.find_resources(question)
        results = []
        for p in providers[:3]:  # Top 3 most relevant
            r = self.query_provider(p["endpoint"], question)
            results.extend(r)
        return results
```

### Example Flow

```python
# Agent wants to research CRISPR delivery

agent = AgentClient("http://discovery.local")

# 1. Discover relevant providers
providers = agent.find_resources("CRISPR delivery mechanisms for gene therapy")
# Returns:
# [
#   { "name": "PaperNode", "endpoint": "http://papers.local", "relevance": 0.91 },
#   { "name": "PatentNode", "endpoint": "http://patents.local", "relevance": 0.78 },
#   { "name": "TrialsNode", "endpoint": "http://trials.local", "relevance": 0.85 }
# ]

# 2. Query the most relevant provider
results = agent.query_provider(
    "http://papers.local",
    "Find recent papers about lipid nanoparticle delivery for CRISPR, focus on in vivo studies"
)
# Returns:
# [
#   { "id": "W123", "title": "LNP-mediated CRISPR delivery...", "relevance": 0.94, ... },
#   { "id": "W456", "title": "In vivo gene editing with...", "relevance": 0.89, ... },
#   ...
# ]

# 3. Query another provider with different data
trials = agent.query_provider(
    "http://trials.local",
    "Clinical trials using lipid nanoparticles for gene therapy"
)
# Returns different schema, agent handles it:
# [
#   { "trial_id": "NCT123", "condition": "...", "phase": 2, ... },
#   ...
# ]
```

### What This MVP Validates

| Question | How MVP Answers It |
|----------|-------------------|
| Can semantic discovery work? | Try it — do agents find relevant providers? |
| Can providers have different schemas? | Test with 3 different data types |
| Can natural language queries work? | See if providers correctly interpret requests |
| Is this useful for agents? | Build an agent that uses it, see if it helps |

### What This MVP Defers

| Deferred | Why |
|----------|-----|
| Decentralization | Can add P2P later; central discovery is fine for MVP |
| Payments | Not needed to validate core idea |
| Privacy/ZK | Can add later if core idea works |
| Verification | Trust providers initially |
| Reputation | No need with small trusted group |

---

## 6. Technical Details for MVP

### Embedding Model

Use a good general-purpose embedding model:
- **Option 1:** OpenAI `text-embedding-3-small` (cheap, good quality)
- **Option 2:** Open source `BGE-large` or `E5-large` (self-hosted)
- **Option 3:** Cohere Embed (good multilingual)

All providers and the discovery service use the SAME model for consistency.

### Natural Language Query Interpretation

Providers need to interpret natural language queries. Options:

**Option A: LLM-based (flexible but slower)**
```python
def interpret_query(self, nl_query):
    prompt = f"""
    Given this natural language query: "{nl_query}"

    My database contains: {self.data_description}

    Convert this to a structured query I can execute.
    Output JSON with: search_terms, filters, limit
    """
    return llm.complete(prompt)
```

**Option B: Pattern matching (fast but rigid)**
```python
def interpret_query(self, nl_query):
    # Extract year filters with regex
    year_match = re.search(r'after (\d{4})', nl_query)
    # Extract keywords
    keywords = extract_keywords(nl_query)
    # Build query
    return {"search": keywords, "year_filter": year_match}
```

**Option C: Hybrid (best of both)**
- Use patterns for common operations
- Fall back to LLM for complex queries

### Discovery Protocol

Simple HTTP-based for MVP:

```yaml
# Provider registration
POST /register
Body: { manifest }

# Search for providers
GET /search?q=natural+language+query
Response: { providers: [...], query_embedding: [...] }

# Provider health check
GET /providers/{id}/health
```

### Query Protocol

```yaml
# Query a provider
POST /query
Body: {
  "request": "natural language query",
  "options": { "limit": 50 }  # Optional
}
Response: {
  "results": [...],
  "metadata": { "total": N, "has_more": bool }
}

# Get provider info
GET /info
Response: {
  "name": "...",
  "description": "...",
  "capabilities": [...],
  "example_queries": [...]
}
```

---

## 7. Putting It Together

### Directory Structure for MVP

```
/protocol-mvp
  /discovery-service
    server.py          # Simple Flask/FastAPI server
    embeddings.py      # Embedding utilities

  /provider-sdk
    base_provider.py   # Base class for providers
    llm_interpreter.py # Query interpretation

  /agent-sdk
    client.py          # Agent client library

  /example-providers
    /papers-provider   # OpenAlex wrapper
    /demo-provider     # Simple demo with fake data

  /examples
    agent_demo.py      # Example agent using the protocol
```

### Minimal Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Provider nodes | Python + FastAPI | Simple, async |
| Discovery service | Python + FastAPI + numpy | Vector search |
| Embeddings | OpenAI API or sentence-transformers | Easy to use |
| Agent SDK | Python | Simple client |
| LLM (for query interpretation) | OpenAI or Anthropic API | Works well |

No databases needed for MVP — can use in-memory or simple JSON files.

---

## 8. What Success Looks Like

After building this MVP, you should be able to:

1. **Run 3 provider nodes** with different data types
2. **Register them** with the discovery service
3. **Query from an agent** with natural language like:
   - "What do you have about quantum computing?"
   - "Find clinical trials for Alzheimer's treatments"
   - "Recent papers on transformer architectures"
4. **Get relevant results** despite:
   - Providers using different internal schemas
   - No pre-defined taxonomy
   - Natural language queries (not SQL)

If this works — the core thesis is validated. Then you can add:
- More providers
- P2P discovery (remove central service)
- Payments
- Privacy features

---

## 9. Open Questions for This Layer

1. **How detailed should provider descriptions be?** Just a paragraph? Or also structured metadata?

2. **Should there be capability standards?** e.g., "semantic_search" means a specific interface, or is it all natural language?

3. **How to handle provider updates?** When data changes, does the description/embedding change?

4. **Multi-turn interactions?** Can agents have conversations with providers, or just single queries?

5. **Result provenance?** How does agent know which provider each result came from when combining?

---

## 10. Summary

| Aspect | Approach |
|--------|----------|
| **Discovery** | Semantic — embed descriptions, match by meaning |
| **Schemas** | Agnostic — providers use whatever they want internally |
| **Query interface** | Natural language — providers interpret and execute |
| **Response format** | Minimal common structure, flexible content |
| **MVP** | Central discovery, HTTP-based, no payments, trust-based |

The key insight: **Let LLMs (in providers and agents) handle the translation between natural language and structured operations.** This makes the protocol flexible without requiring everyone to agree on schemas upfront.
