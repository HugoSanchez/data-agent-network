# Implementation Plan: LibP2P + Tempo MVP

## What is DAN?

**DAN (Data Agent Network)** is a protocol that lets AI agents autonomously discover, negotiate, pay for, and exchange data with each other over a peer-to-peer network.

Today, when an AI agent needs data it doesn't have, it's stuck — it can scrape the web, call a predefined API, or give up. There's no way for an agent to say "I need X data" and have another agent respond "I have it, here's what it costs." DAN creates that missing layer.

**How it works:**

A requester agent broadcasts an intent to the network in natural language — "I need weather data for NYC 2024." Provider agents running on the same P2P network evaluate the request against their own data catalogs using an LLM. If a provider has relevant data, it sends back an offer with a description and price. The requester evaluates offers (potentially from multiple providers), accepts the best one, pays via an on-chain stablecoin transfer, and receives the data. The requester can then compute on the received data to answer the original question.

**The key ideas:**

- **Intent-driven discovery**: Agents describe what they need, not where to find it. Providers self-select based on relevance. No API registries, no hardcoded endpoints.
- **Agents negotiate with agents**: The protocol defines message types (RFQ, Offer, Clarify, Accept, Reject, Confirm) that let agents have multi-turn negotiations — including asking clarifying questions — before committing to a transaction.
- **Payments are native**: Data costs money. The protocol integrates stablecoin payments (via Tempo blockchain) directly into the exchange flow, so providers are compensated and requesters only pay for data they actually receive.
- **One node, two roles**: Every node runs the same software. Configure it with a data catalog and it's a provider. Give it a task and it's a requester. Give it both and it's both — just like peers in BitTorrent.

**This MVP** demonstrates the full loop: two nodes discover each other via LibP2P, negotiate a data exchange using the DAN protocol, settle payment on Tempo's testnet, transfer data over HTTP, and the requester computes a result — all with mock data but real payments.

---

**Language:** TypeScript (ESM)
**Network:** LibP2P (js-libp2p) with mDNS discovery
**Payments:** Tempo testnet (Moderato) via mppx
**Data:** Mocked

---

## Core Design Decision: One Node, Two Roles

There is **one node implementation** — not separate requester/provider binaries. Every node is the same software. Configuration determines behavior:

- **Provider role**: activated by supplying a data catalog (datasets this node can serve). The node registers protocol handlers and starts an HTTP server for payment-gated delivery.
- **Requester role**: activated by giving the node a task (a natural-language intent describing what data is needed and what to compute on it).
- **Both**: a node can provide data AND request other data simultaneously.

```ts
// Same binary, different configs
// Provider mode:
node --catalog ./my-datasets.json

// Requester mode:
node --task "Find weather data for NYC 2024, compute average temperature"

// Both:
node --catalog ./my-datasets.json --task "Find financial data..."
```

This mirrors how P2P networks actually work — every peer is equal, roles are dynamic.

---

## Agent Architecture: Hybrid Model

Two different agent strategies for two different roles:

### Provider: Autonomous daemon with LLM at decision points

The provider runs unattended. It uses direct Anthropic SDK calls (`@anthropic-ai/sdk`) at specific moments — no agent framework, no tool-use loops. The LLM is a function call, not an orchestrator.

```
Incoming RFQ → [LLM: does my catalog match this intent?] → offer, clarify, or ignore
```

That's it. One LLM call per RFQ. Everything else is deterministic protocol code.

### Requester: Claude Code as the driving agent

The user talks to Claude Code. The node exposes a **CLI** that Claude Code calls as shell commands. Claude Code handles all the reasoning — deciding what to search for, evaluating offers, responding to clarifications, writing computation code, interpreting results.

```
User: "Find weather data for NYC and tell me the average temperature"
  │
  └─▶ Claude Code reasons about the request
       │
       ├─▶ $ dan rfq publish "weather data NYC 2024"
       │     → broadcasts intent to P2P network
       │
       ├─▶ $ dan rfq offers
       │     → lists offers and clarification requests from providers
       │     → Claude Code evaluates
       │
       ├─▶ $ dan rfq clarify-reply <offer-id> "Daily granularity"
       │     → responds to provider's question (if needed)
       │
       ├─▶ $ dan rfq accept <offer-id>
       │     → accepts offer, gets HTTP endpoint
       │
       ├─▶ $ dan data fetch <endpoint>
       │     → pays via Tempo, downloads dataset
       │
       ├─▶ Claude Code reads the data, writes computation code
       │
       └─▶ Returns: "The average temperature in NYC in 2024 was 56.3°F"
```

### Why this hybrid

| | Provider | Requester |
|---|---|---|
| **Runs as** | Daemon (background process) | Interactive (Claude Code session) |
| **LLM role** | Function call at decision points | Full orchestrator with tool use |
| **Autonomy** | Fully autonomous | Human-in-the-loop via Claude Code |
| **Library** | `@anthropic-ai/sdk` (direct calls) | Claude Code's built-in capabilities |

The CLI commands work standalone too — you can test the full flow manually without Claude Code. Claude Code just makes it seamless.

---

## Protocol: DAN/1.0.0

All messages share a common envelope and are serialized as JSON over LibP2P streams (length-prefixed) or pubsub topics.

### Message Envelope

```ts
type MessageEnvelope = {
  protocol: "dan/1.0.0"
  type: "rfq" | "offer" | "clarify" | "clarify-reply" | "accept" | "reject" | "confirm"
  id: string            // unique message ID (uuid)
  intentId: string      // ties all messages in a negotiation thread together
  timestamp: number     // unix ms
}
```

The `intentId` is generated by the requester when publishing an RFQ. Every subsequent message in that negotiation — from any party — references this same `intentId`.

### Message Types

#### 1. RFQ (Request for Quote)

Broadcast via pubsub. Requester tells the network what it needs.

```ts
type RFQ = MessageEnvelope & {
  type: "rfq"
  query: string                // "weather data for NYC 2024"
  compute?: string             // "compute average temperature" (optional)
  requesterPeerId: string
}
```

- **Channel**: PubSub topic `/dan/rfq`
- **Direction**: Requester → All (broadcast)

#### 2. Offer

Provider has evaluated the RFQ and is proposing a deal.

```ts
type Offer = MessageEnvelope & {
  type: "offer"
  offerId: string              // unique to this provider-intent pair, used for all subsequent messages
  datasetId: string
  description: string          // "Daily NYC weather, 365 records, Jan-Dec 2024"
  records: number
  price: string                // in smallest unit, as string (avoids precision issues)
  currency: string             // TIP-20 address (e.g. pathUSD)
  providerPeerId: string
}
```

- **Channel**: Direct LibP2P stream `/dan/offer`
- **Direction**: Provider → Requester

#### 3. Clarify

Either side needs more information. Can happen **at any point** in the negotiation — before or after an offer. References the `intentId` and optionally an `offerId` if the conversation has progressed that far.

```ts
type Clarify = MessageEnvelope & {
  type: "clarify"
  offerId?: string             // present if conversation already has an offer
  question: string             // "Do you need daily or hourly granularity?"
  fromPeerId: string
}
```

- **Channel**: Direct LibP2P stream `/dan/clarify`
- **Direction**: Provider → Requester OR Requester → Provider (bidirectional)

#### 4. Clarify Reply

Response to a clarification request.

```ts
type ClarifyReply = MessageEnvelope & {
  type: "clarify-reply"
  offerId?: string
  replyTo: string              // id of the Clarify message being answered
  answer: string               // "Daily granularity"
  fromPeerId: string
}
```

- **Channel**: Direct LibP2P stream `/dan/clarify`
- **Direction**: Bidirectional (mirrors Clarify)

#### 5. Accept

Requester accepts a specific offer.

```ts
type Accept = MessageEnvelope & {
  type: "accept"
  offerId: string
  requesterPeerId: string
}
```

- **Channel**: Direct LibP2P stream `/dan/accept`
- **Direction**: Requester → Provider

#### 6. Reject

Requester declines an offer.

```ts
type Reject = MessageEnvelope & {
  type: "reject"
  offerId: string
  reason?: string              // optional: "too expensive", "wrong granularity"
  requesterPeerId: string
}
```

- **Channel**: Direct LibP2P stream `/dan/accept`
- **Direction**: Requester → Provider

#### 7. Confirm

Provider acknowledges acceptance and provides the HTTP endpoint for paid data delivery.

```ts
type Confirm = MessageEnvelope & {
  type: "confirm"
  offerId: string
  uuid: string                 // unique transaction ID for this delivery
  endpoint: string             // "http://192.168.1.5:3100/data/{uuid}"
  providerPeerId: string
}
```

- **Channel**: Direct LibP2P stream `/dan/accept`
- **Direction**: Provider → Requester

### Negotiation Flows

After the Confirm, communication switches from LibP2P to HTTP+MPP for payment and data delivery.

#### Happy path (no clarification needed)

```
Requester                              Provider
   │──── RFQ (pubsub broadcast) ──────▶│
   │◀─── Offer (direct) ──────────────│
   │──── Accept (direct) ────────────▶│
   │◀─── Confirm (direct) ────────────│
   │                                    │
   │──── HTTP + MPP payment ─────────▶│
   │◀─── Data ─────────────────────────│
```

#### With clarification before offer

```
Requester                              Provider
   │──── RFQ (pubsub broadcast) ──────▶│
   │◀─── Clarify ─────────────────────│  "Daily or hourly?"
   │──── ClarifyReply ────────────────▶│  "Daily"
   │◀─── Offer ───────────────────────│
   │──── Accept ──────────────────────▶│
   │◀─── Confirm ─────────────────────│
```

#### With clarification after offer

```
Requester                              Provider
   │──── RFQ (pubsub broadcast) ──────▶│
   │◀─── Offer ───────────────────────│  "$0.05, 365 records"
   │──── Clarify ─────────────────────▶│  "Does this include humidity?"
   │◀─── ClarifyReply ────────────────│  "Yes, temp + humidity + wind"
   │──── Accept ──────────────────────▶│
   │◀─── Confirm ─────────────────────│
```

#### Rejection

```
Requester                              Provider
   │──── RFQ (pubsub broadcast) ──────▶│
   │◀─── Offer ───────────────────────│
   │──── Reject ──────────────────────▶│  "Too expensive"
```

#### Multiple providers competing

```
Requester              Provider A          Provider B
   │──── RFQ ────────────▶│                    │
   │                       │◀── RFQ (pubsub) ──│
   │◀─── Offer A ─────────│                    │
   │◀─── Offer B ──────────────────────────────│
   │                                            │
   │  (Claude Code evaluates both offers)       │
   │                                            │
   │──── Accept (to B) ───────────────────────▶│
   │──── Reject (to A) ──▶│                    │
   │◀─── Confirm ──────────────────────────────│
```

### LibP2P Protocol IDs

| Protocol | Purpose |
|----------|---------|
| `/dan/rfq` | PubSub topic for RFQ broadcasts |
| `/dan/offer` | Direct stream: provider sends offers to requester |
| `/dan/clarify` | Direct stream: bidirectional clarification |
| `/dan/accept` | Direct stream: accept, reject, and confirm messages |

---

## Architecture: Intent-Based Discovery

Discovery is **not** catalog-browsing. It's intent-driven — the requester broadcasts what it needs, and providers self-select.

### Why this matters

- The requester doesn't need to know what exists beforehand
- Providers only respond if they actually have relevant data
- Multiple providers can compete on an intent (price, quality, relevance)
- This is how agents should work — describe what you need, not browse a menu

---

## Stages

### Stage 1: Project Scaffolding

Set up a working TypeScript project with all dependencies resolving.

**Tasks:**
- [ ] Initialize npm project with `"type": "module"` and TypeScript config
- [ ] Install core deps: `libp2p`, `@libp2p/tcp`, `@libp2p/mdns`, `@chainsafe/libp2p-noise`, `@chainsafe/libp2p-yamux`, `it-length-prefixed-stream`
- [ ] Install Tempo deps: `mppx`, `viem`
- [ ] Install HTTP server: `hono`, `@hono/node-server`
- [ ] Install LLM: `@anthropic-ai/sdk`
- [ ] Create `tsconfig.json` (ESM, ES2022 target)
- [ ] Create a minimal `src/node.ts` entry point that just starts and logs "hello"
- [ ] Add `dev` script to package.json (via `tsx`)

**Done when:** `npm run dev` starts without errors.

---

### Stage 2: LibP2P Node + Peer Discovery

Get two instances of the same node discovering each other.

**Tasks:**
- [ ] Build `src/network.ts` — a `createNode(config)` factory that configures TCP + Noise + Yamux + mDNS
- [ ] Wire up `peer:discovery` and `peer:connect` events with logging
- [ ] `src/node.ts` calls `createNode()` on startup
- [ ] Verify: start two instances on different ports, confirm they discover and connect

**Done when:** Two instances of the same code find each other and log the connection.

---

### Stage 3: Protocol Message Types

Define the DAN/1.0.0 protocol types and serialization utilities.

**Tasks:**
- [ ] Create `src/protocol/types.ts` — TypeScript types for all 7 message types (RFQ, Offer, Clarify, ClarifyReply, Accept, Reject, Confirm)
- [ ] Create `src/protocol/codec.ts` — encode/decode helpers for length-prefixed JSON over LibP2P streams
- [ ] Create `src/protocol/ids.ts` — constants for protocol IDs and pubsub topics
- [ ] Helper to generate `intentId`, `offerId`, and message `id` (uuid v4)

**Done when:** Types compile, codec round-trips all message types correctly.

---

### Stage 4: Intent Broadcasting (RFQ)

Requester broadcasts a data need to the network. Providers hear it.

**Tasks:**
- [ ] Add GossipSub pubsub (`@chainsafe/libp2p-gossipsub`) for network-wide message broadcasting
- [ ] Subscribe all nodes to `/dan/rfq` topic on startup
- [ ] When node starts with `--task`, it publishes an RFQ message to the topic
- [ ] Provider nodes log incoming RFQs

**Done when:** Node A publishes an RFQ, Node B receives and logs it.

---

### Stage 5: Provider Matching + Offers

Provider evaluates an RFQ against its catalog and responds with an offer.

**Tasks:**
- [ ] Define mock data catalog format: `{ id, description, keywords, records, price, currency }`
- [ ] Create `src/catalog.ts` — loads catalog from config/JSON file
- [ ] Implement intent matching with LLM: provider sends its catalog + the incoming RFQ to Claude, asks "does any of my data match this request?" Returns the matching dataset ID or null.
- [ ] If match found, provider dials requester on `/dan/offer` protocol with an Offer message
- [ ] Requester collects offers for a few seconds, logs them

**Done when:** Provider receives an RFQ, LLM confirms a match, and sends an offer back to the requester.

---

### Stage 6: Clarification Flow

Bidirectional clarification between requester and provider.

**Tasks:**
- [ ] Register `/dan/clarify` stream handler on all nodes
- [ ] Provider LLM can return "need clarification" instead of a direct match — triggers a Clarify message
- [ ] Requester (via CLI or Claude Code) can send Clarify to a provider after receiving an Offer
- [ ] Both sides handle ClarifyReply and update their negotiation state
- [ ] After clarification, provider can send a new/updated Offer

**Done when:** A multi-turn negotiation works: RFQ → Clarify → ClarifyReply → Offer.

---

### Stage 7: Accept, Reject + Handoff to HTTP

Requester accepts or rejects an offer. On accept, provider provisions an HTTP endpoint.

**Tasks:**
- [ ] Register `/dan/accept` stream handler on provider
- [ ] Requester sends Accept or Reject referencing an `offerId`
- [ ] On Accept: provider generates a UUID, registers `GET /data/{uuid}` on its HTTP server, responds with Confirm (uuid + endpoint)
- [ ] On Reject: provider logs and cleans up
- [ ] Provider starts HTTP server (Hono) on startup (or lazily on first Accept)

**Done when:** Requester accepts an offer and receives a valid HTTP URL.

---

### Stage 8: Tempo Wallet Setup

Both nodes get funded testnet wallets on startup.

**Tasks:**
- [ ] Create `src/wallet.ts` — generates or loads a private key (from `PRIVATE_KEY` env var, or generates + persists to `.key` file)
- [ ] On startup, fund via `Actions.faucet.fundSync()` on Tempo Moderato testnet
- [ ] Log wallet address and balance

**Done when:** Nodes start with funded testnet wallets and log their addresses.

---

### Stage 9: MPP-Gated Data Endpoint

Provider serves data behind a Tempo payment wall.

**Tasks:**
- [ ] Configure `Mppx.create()` on the provider's HTTP server with `tempo({ account, currency, recipient, testnet: true })`
- [ ] `GET /data/:uuid` route uses `mppx.charge({ amount })` to gate access
- [ ] On successful payment, respond with the mock dataset as JSON
- [ ] Verify with `curl` that the endpoint returns `402` without payment

**Done when:** Unauthenticated requests get `402`; the MPP challenge headers are present.

---

### Stage 10: Paid Data Fetch

Requester pays and receives data — the complete payment flow.

**Tasks:**
- [ ] Configure `Mppx.create()` on the requester (client mode) with the requester's Tempo account
- [ ] After acceptance, requester uses `mppx.fetch(endpoint)` to hit the provider's HTTP endpoint
- [ ] mppx auto-handles: receives 402 → signs payment tx → retries with proof → gets data
- [ ] Requester logs the received data and the transaction hash

**Done when:** Requester pays on Tempo testnet and receives the dataset. Transaction visible on Tempo explorer.

---

### Stage 11: CLI Interface

Expose the requester-side flow as CLI commands that work standalone and as tool calls.

**Tasks:**
- [ ] Create `src/cli.ts` — CLI entry point using a simple arg parser
- [ ] Implement commands:
  - `dan rfq publish "<intent>"` — broadcasts an RFQ to the network
  - `dan rfq offers` — lists received offers and pending clarifications
  - `dan rfq clarify-reply <offer-id> "<answer>"` — responds to a provider's clarification
  - `dan rfq clarify <offer-id> "<question>"` — asks a provider for more info about their offer
  - `dan rfq accept <offer-id>` — accepts an offer, returns HTTP endpoint
  - `dan rfq reject <offer-id>` — rejects an offer
  - `dan data fetch <endpoint>` — pays via MPP and downloads the dataset, saves to stdout or file
  - `dan status` — shows node status, connected peers, wallet balance
- [ ] Add `bin` field to package.json so `dan` is available after `npm link`
- [ ] Test full flow manually: publish → offers → accept → fetch

**Done when:** The entire requester flow can be driven from the command line with sequential commands.

---

### Stage 12: Computation + Result

Requester processes the received data and returns a result.

**Tasks:**
- [ ] For standalone mode: define a simple computation matching the mock scenario (e.g., weather data → average temp, hottest day)
- [ ] `dan data fetch` outputs data to stdout so Claude Code (or any tool) can read and process it
- [ ] Print the final result: "User asked: X → Result: Y"

**Done when:** End-to-end flow completes — intent → discover → offer → accept → pay → data → compute → result.

---

### Stage 13: Claude Code Integration

Wire up Claude Code as the requester agent — the user just talks naturally.

**Tasks:**
- [ ] Create a `CLAUDE.md` in the project root that teaches Claude Code about the `dan` CLI:
  - Available commands and what they do
  - Example workflow: "When the user asks for data, use `dan rfq publish` to find it, then `dan rfq offers` to see what's available, clarify if needed, accept the best offer, fetch the data, and compute the answer"
  - How to read and interpret the output of each command
- [ ] Provider node runs in background (started separately or via `dan provider start`)
- [ ] Test the full flow: user asks Claude Code a question → Claude Code uses `dan` CLI → gets data → writes computation → returns answer

**Done when:** A user can ask Claude Code "Find weather data for NYC and tell me the average temperature" and get an answer, with the P2P discovery and Tempo payment happening transparently.

---

### Stage 14: Polish + Demo

Make it easy to run and understand.

**Tasks:**
- [ ] Add a `demo.sh` script that starts a provider instance in background, then shows how to use the requester (manually or via Claude Code)
- [ ] Add clear, labeled console output showing each phase of the flow
- [ ] Add a `README.md` with setup instructions and what to expect
- [ ] Clean up hardcoded values into config/env vars

**Done when:** Someone can clone the repo, run the demo, and see the full agent-to-agent data exchange with payment.

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `libp2p` | ^3.1 | Core P2P networking |
| `@libp2p/tcp` | ^11.0 | TCP transport |
| `@libp2p/mdns` | ^12.0 | Local peer discovery |
| `@chainsafe/libp2p-gossipsub` | latest | Pubsub for intent broadcasting |
| `@chainsafe/libp2p-noise` | ^17.0 | Encrypted connections |
| `@chainsafe/libp2p-yamux` | ^8.0 | Stream multiplexing |
| `it-length-prefixed-stream` | ^2.0 | Framed messages over streams |
| `mppx` | ^0.5 | Machine Payments Protocol |
| `viem` | ^2.47 | Ethereum/Tempo client |
| `hono` | ^4.0 | HTTP server (provider) |
| `@hono/node-server` | ^1.0 | Node.js adapter for Hono |
| `@anthropic-ai/sdk` | latest | LLM for provider intent matching |
| `tsx` | ^4.0 | TypeScript execution |

## Tempo Testnet Config

| Setting | Value |
|---------|-------|
| Chain | Tempo Moderato (testnet) |
| Chain ID | 42431 |
| RPC | `https://rpc.moderato.tempo.xyz` |
| Explorer | `https://explore.tempo.xyz` |
| pathUSD | `0x20c0000000000000000000000000000000000000` |
| Faucet | `Actions.faucet.fundSync()` via viem |

## File Structure (Target)

```
src/
├── node.ts              # Entry point — parses config, starts the agent
├── cli.ts               # CLI entry point — `dan` commands for requester flow
├── network.ts           # LibP2P node factory (transport, encryption, discovery)
├── wallet.ts            # Tempo wallet setup + funding
├── catalog.ts           # Data catalog loading + LLM-powered intent matching
├── protocol/
│   ├── types.ts         # All DAN/1.0.0 message type definitions
│   ├── codec.ts         # Encode/decode for length-prefixed JSON over streams
│   ├── ids.ts           # Protocol IDs and pubsub topic constants
│   ├── rfq.ts           # Pubsub: publish/subscribe to RFQs
│   ├── offer.ts         # /dan/offer — provider sends offers
│   ├── clarify.ts       # /dan/clarify — bidirectional clarification
│   └── accept.ts        # /dan/accept — accept, reject, confirm
├── http/
│   └── server.ts        # Hono HTTP server with MPP payment gating
├── data/
│   └── mock.ts          # Mock datasets
└── compute/
    └── analyze.ts       # Computation logic on received data
CLAUDE.md                # Teaches Claude Code how to use the `dan` CLI
```
