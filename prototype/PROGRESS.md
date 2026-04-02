# Kelper Prototype Progress

## Clarity on Deliverables (What Are We Building?)

### The Stack

```
┌─────────────────────────────────────────────────────────────┐
│              ANY AGENT FRAMEWORK                            │
│     OpenClaw  │  LangChain  │  Custom  │  AutoGPT  │ ...   │
└───────────────────────────┬─────────────────────────────────┘
                            │ imports
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     KELPER SDK                              │
│                                                             │
│   kelper.discover("I need X data")                         │
│   kelper.announce(my_catalog, my_capabilities)             │
│   kelper.request(provider, query)                          │
│   kelper.verify(result, attestation)                       │
└───────────────────────────┬─────────────────────────────────┘
                            │ speaks
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   KELPER PROTOCOL                           │
│            (P2P messages, verification, payments)           │
└─────────────────────────────────────────────────────────────┘
```

### Deliverables (Bottom → Top)

| Layer | Deliverable | Description |
|-------|-------------|-------------|
| **Protocol Spec** | Document | Message formats, flows, verification rules |
| **SDK/Library** | Python/JS package | `kelper.discover()`, `kelper.request()`, etc. |
| **Skill File** | Thin wrapper | "Here's how to use the SDK from your agent" |

**Key principle**: The SDK is **agent-framework agnostic**. OpenClaw, LangChain, or a custom agent can all use it. We don't couple to any specific framework.

### MVP Deliverables

| Deliverable | What it is |
|-------------|------------|
| **Protocol Spec** | The "rules" - message formats, flows, verification |
| **SDK** | Reference implementation of the protocol |
| **Example Provider** | Shows how to offer data/compute |
| **Example Requester** | Shows how to discover and query |

> Together these demonstrate: **discovery → capability exchange → arbitrary compute → result with attestation**

The Skill file is just a thin wrapper: "here's how to call the SDK from your agent."

---

## What Works Today

- Two LLM agents discover each other via **libp2p + mDNS** on local network
- Agents can exchange messages with mock LLM responses
- `quit` command exits cleanly
- Basic CLI: `list` peers, `send <peer> <message>`

```
Terminal 1: python agent.py --name "Alice" --port 8000
Terminal 2: python agent.py --name "Bob" --port 8001

> list
> send 1 hello
```

---

## Architecture Decision Pending: Python vs JS

### Python (current)
- **Pro**: Working code, better for data processing (pandas, numpy, SQL)
- **Con**: py-libp2p is a port, hit issues with peer TTL expiration and Noise handshake crashes

### JavaScript/TypeScript
- **Pro**: libp2p-js is the reference implementation (more mature), Vercel AI SDK is polished
- **Con**: Would require rewrite, data processing less natural

**Decision needed**: If providers will run Python data pipelines, stay Python. If providers expose language-agnostic APIs, JS might be smoother.

---

## Discovery Approach: The Edge

### The Problem with Current Approaches

| Approach | How it works | Problem |
|----------|--------------|---------|
| Keyword search | "CRISPR papers" → exact match | Misses semantically similar data |
| Centralized registry | Browse a catalog | Single point of failure, curation bottleneck |
| Ask all peers | Query everyone | Doesn't scale |

### Our Approach: Semantic + Decentralized

**Every provider runs semantic matching locally.** No central index. No keyword brittleness.

```
Agent A: "I need clinical trial data for mRNA vaccine efficacy"
          │
          ▼ (broadcast to network)

Provider B's LLM checks their catalog:
  "I have: Phase 3 trial results for COVID vaccines 2021-2024"
  → LLM decides: YES, relevant → Responds with announcement

Provider C's LLM checks their catalog:
  "I have: Restaurant reviews in Austin"
  → LLM decides: NO, not relevant → Stays silent
```

### Why This Is Powerful

1. **No schema agreement needed** - Providers describe data in natural language
2. **No central bottleneck** - Discovery is peer-to-peer
3. **Fuzzy matching for free** - LLMs handle synonyms, related concepts
4. **Privacy-friendly** - Provider decides what to reveal

### Scale Challenge (Future)

Can't broadcast to millions. Solutions: DHT with semantic clustering, gossip-based topic routing. For MVP, local network broadcast is fine.

---

## Proposed Protocol Design

The protocol should be **semantic and open-ended** - providers define their own interfaces.

### Message Types

```
1. DISCOVER  →  "I need data about X"
2. ANNOUNCE  ←  "I have data matching X, here's my interface"
3. REQUEST   →  {payload in provider's format}
4. RESPONSE  ←  {result}
```

### Key Insight

The **LLM does semantic matching**. When a provider receives a `discover` message, their LLM decides if their data catalog is relevant. No need for a centralized registry or keyword matching.

### Example Flow

```
A → all:  { type: "discover", query: "Austin real estate prices" }

B → A:    { type: "announce",
            match: "I have MLS data for Austin 2020-2024",
            interface: { type: "sql", schema: "listings(price, sqft, ...)" } }

A → B:    { type: "request", payload: "SELECT AVG(price) FROM listings" }

B → A:    { type: "response", result: { avg_price: 485000 } }
```

---

## Next Steps (in order)

### 1. Language Decision
Decide Python vs JS based on expected provider workloads.

### 2. Model-Agnostic LLM Integration
- **Python**: Add LiteLLM (supports OpenAI, Anthropic, Ollama, etc.)
- **JS**: Use Vercel AI SDK

### 3. Implement Protocol Message Types
Add `discover`, `announce`, `request`, `response` message handling.

### 4. Provider Configuration
Simple config file where providers describe:
- Their data catalog (natural language)
- Their interface (SQL, API, etc.)

### 5. Basic Executor
Provider-side execution of requests. Start simple (even just returning mock data), add sandboxing later.

### 6. Future (v2+)
- Verifiable compute (hash commitments → zkVM)
- Payment integration
- DHT for internet-wide discovery (beyond local mDNS)

---

## Files

| File | Purpose |
|------|---------|
| `agent.py` | Main implementation (~310 lines) |
| `requirements.txt` | Dependencies: libp2p, trio, anthropic |
| `README.md` | Setup instructions |
| `PROGRESS.md` | This file |

---

## Open Questions

1. **Execution sandboxing**: Who's responsible? Protocol or provider?
   - Current thinking: Provider's responsibility, protocol is just transport

2. **Capability schema**: Should `interface` be structured (JSON Schema, OpenAPI) or free-form?
   - Current thinking: Start free-form, let LLMs interpret. Standardize later if needed.

3. **Multi-provider responses**: If multiple providers match a `discover`, how does requester choose?
   - Ideas: Reputation, price, response time, let the requester's LLM decide

---

## Open Questions: Arbitrary Compute

The core tension:

```
REQUESTER WANTS:              PROVIDER WANTS:
─────────────────             ─────────────────
• Run any code                • No malicious code
• Access the data             • No data exfiltration
• Get correct results         • Fair payment
• Pay fair price              • Bounded resources
```

### Sub-Problems

| # | Problem | Question | MVP Approach |
|---|---------|----------|--------------|
| 3a | **Code format** | What does requester send? | Hybrid: NL → Provider generates code → Requester approves |
| 3b | **Sandboxing** | How to run untrusted code safely? | WASM or Docker with strict limits (provider's choice) |
| 3c | **Data protection** | How to prevent data exfiltration? | Accept risk for MVP; privacy-preserving compute is v2 |
| 3d | **Resource limits** | How to prevent infinite loops? | Provider enforces max CPU, memory, output size |
| 3e | **Verification** | How to know code ran correctly? | Attestation (signed receipt); ZK is future |

### MVP Flow

```
1. DISCOVER     → Requester asks network for data
2. ANNOUNCE     → Provider responds with capabilities
3. REQUEST      → Requester sends natural language query
4. TRANSLATE    → Provider LLM converts to executable, shows requester
5. APPROVE      → Requester confirms
6. EXECUTE      → Provider runs in sandbox
7. RESPOND      → Provider returns result + signed attestation
```

### Deferred to Later

- Privacy-preserving compute (differential privacy, MPC)
- ZK proofs for trustless verification
- Complex DSL design
- Partial execution / streaming results

---

## Trust & Identity: DNS Verification

### The Problem

How do we prevent impersonation? Anyone could claim to be "Dune Analytics" and scam requesters.

### Solution: DNS-Based Verification (for known entities)

```
┌─────────────────────────────────────────────────────────────┐
│                  DNS-BASED VERIFICATION                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Dune generates a Kelper keypair (peer ID)              │
│                                                             │
│  2. Dune publishes their peer ID on their domain:          │
│     _kelper.duneanalytics.com TXT "peer_id=12D3Koo..."     │
│                                                             │
│  3. Agent discovers a provider claiming to be Dune         │
│                                                             │
│  4. Agent checks: does duneanalytics.com vouch for         │
│     this peer ID? YES → verified. NO → imposter.           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Why This Works

- Leverages existing DNS trust (no new infrastructure)
- Simple to implement (just a TXT record lookup)
- Similar to email SPF/DKIM (proven pattern)
- No tokens or staking required for known entities

### Example Flow

```
Provider: "I'm Dune Analytics, I have blockchain data"
    │
    ▼
Agent: Checks _kelper.duneanalytics.com TXT record
    │
    ├─► Peer ID matches → Verified, proceed with trust
    │
    └─► Peer ID doesn't match → Reject as imposter
```

### Open Question: Unknown Providers

For new/anonymous providers without a domain, we may need economic mechanisms (staking, escrow). TBD - the main challenge is trustless dispute resolution.

---

*Last updated: 2026-03-24*
