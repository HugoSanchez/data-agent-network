# An Agent-Native Data Exchange Protocol

*Internal working document — March 2026*

---

## 1. The Problem

The web was built for humans. Search engines return documents. APIs return JSON for apps. Everything assumes a human will read, interpret, and decide.

But agents are different. They don't want to parse HTML. They don't want to click through rate limits and CAPTCHAs. They want to find data, query it, maybe run computation on it, and move on.

Today, when an agent needs data:
- It searches the web like a human would
- It scrapes, parses, and hopes the format doesn't change
- It only sees public data (the vast majority is private, siloed, or paywalled)
- It can read, but it can't compute on data it doesn't own

There's no standard way for agents to say: *"I need data about X. Who has it? What can I do with it? How much does it cost?"*

---

## 2. The Opportunity

There's a lot of valuable data that's:
- Behind corporate firewalls
- Too sensitive to publish openly
- Not worth the effort to build a website for
- Only valuable if you can compute on it (not just read it)

This data stays locked because there's no easy, trusted way to make it discoverable and usable without giving it away.

**What if agents could:**
- Discover data sources by describing what they need (in natural language)
- Query providers directly, using whatever interface the provider offers
- Run computation on data they don't own, without the data leaving the provider
- Pay for what they use

This isn't a new database. It's a **protocol for agents to find and exchange data with each other**.

---

## 3. What We're Building

### The Stack

```
┌─────────────────────────────────────────────────────────────┐
│              ANY AGENT FRAMEWORK                            │
│     OpenClaw  │  LangChain  │  Custom  │  AutoGPT  │ ...   │
└───────────────────────────┬─────────────────────────────────┘
                            │ imports
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        SDK                                  │
│                                                             │
│   discover("I need X data")                                │
│   announce(my_catalog, my_capabilities)                    │
│   request(provider, query)                                 │
│   verify(result, attestation)                              │
└───────────────────────────┬─────────────────────────────────┘
                            │ speaks
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      PROTOCOL                               │
│          (P2P messages, identity, verification)             │
└─────────────────────────────────────────────────────────────┘
```

### Key Principle

The SDK is **agent-framework agnostic**. It doesn't matter if you're using OpenClaw, LangChain, or a custom agent. The SDK provides the interface; your agent decides how to use it.

### Deliverables

| Deliverable | What it is |
|-------------|------------|
| **Protocol Spec** | The rules — message formats, flows, identity verification |
| **SDK** | Reference implementation of the protocol |
| **Example Provider** | Shows how to offer data/compute |
| **Example Requester** | Shows how to discover and query |

---

## 4. How Discovery Works

### The Problem with Current Approaches

| Approach | How it works | Why it fails |
|----------|--------------|--------------|
| Keyword search | "CRISPR papers" → exact match | Misses semantically similar data |
| Centralized registry | Browse a catalog | Single point of failure, curation bottleneck |
| Query all peers | Ask everyone | Doesn't scale |

### Our Approach: Semantic + Decentralized

Every provider runs semantic matching locally. No central index. No keyword brittleness.

```
Requester: "I need clinical trial data for mRNA vaccine efficacy"
              │
              ▼ (broadcast to network)

Provider A's LLM checks their catalog:
  "I have: Phase 3 trial results for COVID vaccines 2021-2024"
  → Decides: YES, this is relevant
  → Responds with announcement

Provider B's LLM checks their catalog:
  "I have: Restaurant reviews in Austin"
  → Decides: NO, not relevant
  → Stays silent
```

### Why This Works

1. **No schema agreement needed** — Providers describe data in natural language
2. **No central bottleneck** — Discovery is peer-to-peer
3. **Fuzzy matching for free** — LLMs handle synonyms, related concepts
4. **Privacy-friendly** — Provider decides what to reveal about their catalog

### Scale (Future Problem)

Broadcasting to millions of providers won't work. We'll need DHT with semantic clustering or gossip-based topic routing. For MVP, local network broadcast is fine.

---

## 5. The Protocol

### Message Types

```
1. DISCOVER  →  "I need data about X"
2. ANNOUNCE  ←  "I have data matching X, here's my interface"
3. REQUEST   →  {query in provider's format}
4. RESPONSE  ←  {result + attestation}
```

### Example Flow

```
Requester → Network:
  { type: "discover", query: "Austin real estate prices" }

Provider → Requester:
  { type: "announce",
    match: "I have MLS data for Austin 2020-2024",
    interface: {
      type: "sql",
      schema: "listings(price, sqft, beds, baths, city, zip, sold_date)",
      example: "SELECT AVG(price) FROM listings WHERE city='Austin'"
    }
  }

Requester → Provider:
  { type: "request",
    payload: "SELECT AVG(price) FROM listings WHERE sqft > 2000" }

Provider → Requester:
  { type: "response",
    result: { avg_price: 485000 },
    attestation: { signature: "...", data_version: "2024-03-15" }
  }
```

### Key Insight

The protocol doesn't dictate what providers can do. SQL, GraphQL, natural language, custom API — providers define their own interface. The protocol just handles discovery and transport.

Agents and providers both have LLMs. They can negotiate and understand each other's formats without rigid schemas.

---

## 6. Trust & Identity

### The Problem

Anyone could join the network and claim to be "Dune Analytics" when they're not. Without identity verification, the network is vulnerable to impersonation and scams.

### Solution: DNS-Based Verification

For known entities (companies, organizations with domains), we use a simple pattern similar to email SPF/DKIM:

```
1. Dune Analytics generates a protocol keypair (peer ID)

2. Dune publishes their peer ID on their domain:
   _protocol.duneanalytics.com TXT "peer_id=12D3KooWXYZ..."

3. When a provider claims to be Dune, any agent can verify:
   - Look up _protocol.duneanalytics.com
   - Check if the peer ID matches
   - If yes → verified. If no → imposter.
```

### Why This Works

- Leverages existing DNS trust (no new infrastructure)
- Simple to implement (just a TXT record lookup)
- No tokens or staking required
- Proven pattern (email has used this for decades)

### Open Question: Unknown Providers

For new or anonymous providers without a domain, DNS verification doesn't help. We may need economic mechanisms (staking, escrow) but **we don't have a good solution yet**.

The core challenge: **trustless dispute resolution**. If a provider returns bad data, how do you prove it without a trusted third party? This is unsolved for now.

---

## 7. Arbitrary Compute (Sketch)

Beyond querying data, providers could execute arbitrary code on data they hold. This unlocks scenarios where:
- Data is too sensitive to share
- Data is too large to transfer
- You need computation, not raw data

### The Vision

```
Requester: "Find clusters in this citation graph and identify bridge papers"

Provider: "I understood that as:
  1. Filter to quantum computing papers (2020+)
  2. Build citation graph
  3. Run Louvain clustering
  4. Find high-betweenness nodes

  Estimated cost: $0.05. Proceed?"

Requester: "Yes"

Provider: [executes in sandbox, returns results + attestation]
```

### What We Think We Know

| Aspect | Current Thinking |
|--------|------------------|
| Code format | Requester sends natural language, provider translates to executable |
| Approval | Provider shows translated code, requester approves before execution |
| Sandboxing | Provider's responsibility (WASM, Docker, etc.) |
| Resource limits | Provider enforces max CPU, memory, output size |
| Verification | Signed attestation for MVP; ZK proofs are future |

### What We Don't Know

| Problem | Why It's Hard |
|---------|---------------|
| Data exfiltration | If code can read data, how do you prevent it from returning all the data? |
| Trustless verification | How do you prove code ran correctly without re-executing? |
| Pricing | How do you estimate cost before running? |
| Privacy-preserving compute | How to compute without revealing data? (MPC, ZK, TEE) |

**This layer is not fully designed.** We're sketching it, not committing to it.

---

## 8. What We Know vs. Don't Know

### We Have Clarity On

| Topic | What We Know |
|-------|--------------|
| **Deliverables** | Protocol spec + SDK, agent-framework agnostic |
| **Discovery mechanism** | Semantic matching, providers self-select relevance |
| **Message types** | DISCOVER, ANNOUNCE, REQUEST, RESPONSE |
| **Identity for known entities** | DNS-based verification |
| **Prototype** | Two agents can discover each other and exchange messages via libp2p |

### We Don't Have Clarity On

| Topic | What's Unclear |
|-------|----------------|
| **Identity for unknown providers** | No trustless dispute resolution mechanism |
| **Arbitrary compute** | Sandboxing, data protection, verification all TBD |
| **Payments** | No design yet |
| **Scale** | DHT/gossip for internet-scale discovery not designed |
| **Language choice** | Python (current) vs JavaScript (more mature libp2p) |

We're being explicit about these gaps. They're not failures — they're the work ahead.

---

## 9. Current State

### What the Prototype Does Today

- Two LLM agents discover each other via **libp2p + mDNS** on local network
- Agents can exchange messages with real LLM responses (Claude via LiteLLM)
- Agents can have autonomous conversations (`--auto` mode)
- Clean quit functionality

```bash
# Terminal 1
python agent.py --name "Alice" --port 8000

# Terminal 2
python agent.py --name "Bob" --port 8001 --auto
```

### What It Doesn't Do Yet

- Protocol message types (DISCOVER, ANNOUNCE, etc.)
- Provider configuration (catalog, capabilities)
- Semantic matching for discovery
- DNS verification
- Any form of compute execution

---

## 10. Relationship to Existing Work

### Data Sources

| Project | What It Does | How We Relate |
|---------|--------------|---------------|
| OpenAlex | 271M scientific papers, open API | Data is already indexed; opportunity is compute |
| Semantic Scholar | 200M papers with embeddings | Same — indexing is solved |
| CORE | 46M full-text papers | Same |

**Insight**: The opportunity isn't indexing data. It's enabling **computation on data** and making **private data discoverable**.

### Agent Frameworks

| Project | What It Does | How We Relate |
|---------|--------------|---------------|
| OpenClaw | Local AI agent, runs on your machine | Complementary — an agent could use our SDK |
| LangChain | Agent framework | Same — framework-agnostic SDK |
| AutoGPT | Autonomous agent | Same |

**Insight**: We're not building an agent framework. We're building infrastructure that any agent can use.

### Decentralized Data

| Project | What It Does | How We Relate |
|---------|--------------|---------------|
| IPFS | Decentralized file storage | Storage only, no compute or discovery |
| Filecoin | Incentivized storage | Storage only |
| Ocean Protocol | Data marketplace | Closer, but not agent-native |
| The Graph | Blockchain data indexing | Blockchain-specific |

**Insight**: Nothing is designed for **AI agents** to **discover, query, and compute** on **diverse data** in an **open network**.

---

## 11. Why This Matters

If this works, agents could:

- Access private data that's currently locked away (with permission and payment)
- Compute across distributed datasets without centralizing them
- Discover resources by meaning, not by knowing the exact API
- Pay providers fairly for data and compute

The web gave humans access to information. This could give agents access to computation on information.

---

## 12. Open Questions

These are questions we need to answer, not rhetorical:

1. **Is semantic discovery actually better?** We believe it is, but need to test at scale.

2. **Will providers join?** What's the incentive? Who are the first providers?

3. **Is DNS verification enough?** It handles known entities, but what about the long tail?

4. **How do we handle bad actors without staking?** Reputation alone may not be enough.

5. **Should we switch to JavaScript?** libp2p-js is more mature than py-libp2p.

6. **What's the MVP that validates the core thesis?** Discovery + simple query? Or do we need compute?

---

## 13. Next Steps

In rough priority order:

1. **Decide language** — Python vs JS based on tradeoffs
2. **Implement protocol messages** — DISCOVER, ANNOUNCE, REQUEST, RESPONSE
3. **Add provider configuration** — Catalog description, capability declaration
4. **Wire up semantic matching** — Provider LLM decides relevance
5. **Add DNS verification** — For known entity trust
6. **Test with real scenario** — Two providers, one requester, actual data

---

*This document is a snapshot of our current thinking. It will evolve.*
