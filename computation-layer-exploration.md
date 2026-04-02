# Exploration: Arbitrary Computation on Provider Data

**Context:** Part of the larger exploration of an agentic data marketplace. This focuses specifically on the computation layer — how agents can request arbitrary computations on data they don't have direct access to.

---

## 1. The Core Idea

**"Send me a program, I'll run it on my data, prove I ran it correctly, and charge based on compute used."**

Why this is powerful:
- Goes beyond fixed APIs (no more "we only support these 5 operations")
- Agent expresses exactly what they want
- Provider doesn't need to anticipate every use case
- Computation stays with the data (privacy-preserving potential)

---

## 2. The Proposed Flow

```
STEP 1: Discovery
────────────────
Agent A: "What data do you have?"
Agent B: {
  "description": "Scientific papers with citations",
  "schema_hint": "Each record has: title, abstract, authors,
                  citations (list of paper IDs), year, venue",
  "size": "271M records",
  "supported_primitives": ["map", "filter", "reduce",
                           "group_by", "join", "sort"],
  "example_record": { ... }
}

STEP 2: Request
────────────────
Agent A: {
  "task": "I want to find research clusters in quantum
           computing and identify bridge papers that connect
           different clusters",
  "pseudo_code": """
    papers = filter(year >= 2020, topic ~ 'quantum computing')
    graph = build_citation_graph(papers)
    clusters = community_detection(graph, algorithm='louvain')
    bridges = find_bridge_nodes(graph, clusters)
    return {
      clusters: summarize(clusters),
      bridge_papers: top(bridges, 50)
    }
  """,
  "output_format": "json with cluster summaries and paper IDs"
}

STEP 3: Review & Quote
──────────────────────
Agent B: {
  "understood_as": {
    "step1": "Filter to ~50K papers matching quantum computing after 2020",
    "step2": "Build citation graph (~50K nodes, ~200K edges)",
    "step3": "Run Louvain clustering",
    "step4": "Compute betweenness centrality for bridges",
    "step5": "Return cluster summaries + top 50 bridges"
  },
  "estimated_compute": "~500M cycles",
  "estimated_cost": "$0.05",
  "verification_options": {
    "none": { "cost": "$0.05", "trust": "provider" },
    "attestation": { "cost": "$0.06", "trust": "signed log" },
    "zk_proof": { "cost": "$2.00", "trust": "mathematical" }
  },
  "proceed?": true
}

STEP 4: Confirm
────────────────
Agent A: {
  "confirm": true,
  "verification": "attestation",
  "payment_authorized": "$0.06"
}

STEP 5: Execute
────────────────
Agent B:
  - Compiles pseudo-code to safe execution plan
  - Runs in sandboxed environment (WASM or container)
  - Measures actual cycles/time
  - Validates output doesn't leak raw data (if required)

STEP 6: Return
────────────────
Agent B → Agent A: {
  "results": {
    "clusters": [...],
    "bridge_papers": [...]
  },
  "execution_receipt": {
    "actual_cycles": 487234891,
    "wall_time_ms": 3420,
    "attestation": "signed_hash_of_execution_log"
  }
}
```

---

## 3. Code/Request Format Options

| Option | Pros | Cons |
|--------|------|------|
| **Actual Rust/Python** | Maximum flexibility | Security nightmare |
| **WASM module** | Sandboxed, portable | Still needs constraints |
| **DSL (domain-specific)** | Safe, predictable | Less flexible |
| **Query plan (structured ops)** | Very safe, composable | Limited expressiveness |
| **Natural language** | Most flexible for requester | Provider must translate |

**Likely approach:** Hybrid. Agent A sends natural language or pseudo-code. Agent B (with LLM) translates to a safe internal representation, shows Agent A "here's what I understood, proceed?"

---

## 4. Execution Environment Options

| Sandbox | Security | Overhead | Notes |
|---------|----------|----------|-------|
| Docker + limits | Medium | Low | Network disabled, resource limits |
| WASM (Wasmtime) | High | Low | No syscalls, deterministic |
| gVisor/Firecracker | High | Low-Medium | Strong isolation |
| TEE (SGX/Nitro) | High | Medium | Hardware isolation |
| ZKVM (SP1, RISC Zero) | Very High | Very High (10-1000x) | Provably correct |

---

## 5. Verification Options

| Level | How It Works | Trust Model | Overhead |
|-------|--------------|-------------|----------|
| **None** | Just return results | Trust provider completely | None |
| **Attestation** | Signed log of execution | Trust provider's signature | Low |
| **Redundant execution** | Run on multiple providers, compare | Trust majority | 2-3x |
| **TEE** | Hardware attestation | Trust hardware | Low-Medium |
| **ZK Proof** | Mathematical proof of correct execution | Trustless | 10-1000x |

---

## 6. ZKVM Deep Dive (SP1, RISC Zero)

ZKVMs can:
- Run arbitrary Rust programs
- Prove the program ran correctly with given outputs
- Keep inputs private (data never leaves)
- Measure cycles (fair pricing metric)

**When ZK makes sense:**
- Financial/legal consequences to wrong results
- Agent A doesn't trust Agent B
- Privacy is critical
- Audit trail required

**When ZK is overkill:**
- Exploratory research
- Low-stakes queries
- Trusted provider relationship

**Current reality:**
- 10-1000x overhead (improving rapidly)
- Proving time can be significant
- Writing ZK-compatible code has constraints
- Cost is higher but becoming practical

---

## 7. Key Challenges Identified

### Challenge 1: Data Exfiltration
If code can read data, how do you ensure output is "safe"?

Options:
- Constrain return types (only aggregates)
- Output review (automated or manual)
- Differential privacy (add noise)
- Accept risk and price it in
- Only matters for privacy-sensitive providers

**Current thinking:** Defer for MVP. Many providers are OK with data access if paid. Privacy-preserving compute is a later feature.

### Challenge 2: Translation Reliability

**Problem:** How reliably can we translate agent requests to executable code? What if the translation is wrong?

**Solution: Code Review Protocol**

```
1. Agent A sends request (natural language or pseudo-code)
2. Agent B translates to actual executable code
3. Agent B sends back: code + explicit assumptions + cost estimate
4. Agent A reviews and approves (or asks for changes)
5. Agent B executes
6. If runtime error: B either fixes or reports error to A
```

**Why this works:**
- LLM-based agents can actually read and understand code (genuine review)
- Assumptions become explicit ("I assumed 'recent' means 2020+")
- Errors are normal and handled gracefully
- It's iterative — A can ask for changes

**Remaining edge cases:**
- Subtle bugs A doesn't catch → handle when they happen
- Slow for simple queries → could have "auto-approve" for simple patterns

### Challenge 3: Resource Estimation & Safety

**Problem:** How do you estimate cost before running? How do you prevent unsafe code?

**Solution: Provider-Specific Internal Agents**

Each provider runs their own validation and estimation. They know their data best.

```
┌─────────────────────────────────────────────────────────────┐
│                    PROVIDER B INTERNAL                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Agent A's request                                          │
│        │                                                     │
│        ▼                                                     │
│  ┌─────────────┐                                            │
│  │ Translator  │  ← LLM: converts request to code           │
│  │   Agent     │                                            │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                            │
│  │ Validator   │  ← Checks: safe? bounded? sane?            │
│  │   Agent     │     (no infinite loops, reasonable memory) │
│  └──────┬──────┘                                            │
│         │ (reject if unsafe)                                │
│         ▼                                                    │
│  ┌─────────────┐                                            │
│  │ Estimator   │  ← Estimates: cycles, time, cost           │
│  │   Agent     │     (sampling, heuristics, history)        │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ▼                                                    │
│  Return to Agent A: code + assumptions + estimate           │
│                                                              │
│  [If approved by A]                                          │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                            │
│  │  Executor   │  ← Sandbox, runs code, measures            │
│  │             │                                            │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ▼                                                    │
│  Return to Agent A: results + actual metrics                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** These internal agents (Translator, Validator, Estimator, Executor) could be standardized components that any provider can use.

### Challenge 4: Error Handling

**Approach:** Errors are normal. Handle gracefully.

| Error Type | Handling |
|------------|----------|
| Syntax error in request | Reject before running, ask for clarification |
| Translation failure | Ask A for more detail |
| Validation failure | Reject, explain why |
| Runtime error | Report to A, optional retry |
| Timeout | Return partial results or refund |

### Challenges Deferred for Later

| Challenge | Why Deferred |
|-----------|--------------|
| Long-running jobs (async) | MVP can use simple sync model |
| Partial failure refunds | Figure out when it happens |
| Output format standardization | Let agents handle heterogeneity initially |
| Determinism / reproducibility | Nice to have, not essential |

---

## 8. MVP Plan

**Participants:** We are both Agent A and Agent B

**Data:** Simple SQL dataset

**Scope:**
1. Provider wraps dataset with schema description
2. Agent sends natural language or pseudo-code request
3. Provider translates to execution plan (LLM-assisted)
4. Provider shows plan for confirmation
5. Provider executes in simple sandbox
6. Returns results + cycle count

**Deferred:**
- ZK verification
- Payments
- Network/discovery
- Privacy-preserving compute

---

## 9. Open Questions

1. What trust level is needed? Attestation enough, or ZK essential?
2. What computations matter most? (Affects primitive prioritization)
3. How important is fully custom code vs. rich predefined primitives?
4. How to handle long-running computations?
5. How to handle data updates / versioning / reproducibility?

---

## 10. Next Steps

- [ ] Identify other blockers beyond exfiltration
- [ ] Design the translation layer (request → execution plan)
- [ ] Define the primitive set for V0
- [ ] Prototype with simple SQL dataset
