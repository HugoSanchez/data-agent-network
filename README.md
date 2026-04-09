# DAN - Data Agent Network

A peer-to-peer protocol where AI agents discover, negotiate, pay for, and exchange data with each other.

## How It Works

```
Requester                          Provider
    |                                  |
    |  1. RFQ (broadcast via pubsub)   |
    |--------------------------------->|
    |                                  |  LLM evaluates query
    |  2. Offer (direct stream)        |  against data catalog
    |<---------------------------------|
    |                                  |
    |  3. Accept (direct stream)       |
    |--------------------------------->|
    |                                  |  Provisions HTTP endpoint
    |  4. Confirm (same stream)        |
    |<---------------------------------|
    |                                  |
    |  5. GET /data/:uuid (HTTP)       |
    |--------------------------------->|
    |     402 Payment Required         |
    |<---------------------------------|
    |                                  |
    |  6. Pay (Tempo blockchain)       |
    |--------------------------------->|
    |                                  |
    |  7. GET /data/:uuid + credential |
    |--------------------------------->|
    |     200 OK + dataset (JSON)      |
    |<---------------------------------|
```

**Discovery** happens over libp2p GossipSub. **Negotiation** happens over direct libp2p streams. **Payment** happens on Tempo's testnet via the Machine Payment Protocol (MPP). **Data delivery** happens over HTTP.

## Tech Stack

- **Networking**: libp2p (TCP + Noise encryption + Yamux multiplexing + GossipSub)
- **LLM**: Claude (via Anthropic SDK) for intent matching and clarification
- **Payments**: Tempo testnet (Moderato) with pathUSD stablecoin via [mppx](https://github.com/tempoxyz/mppx)
- **HTTP**: Hono server with MPP payment gating
- **Language**: TypeScript (ESM), Node.js

## Prerequisites

- **Node.js** v20+ (tested on v25)
- **pnpm** (`brew install pnpm` or `npm i -g pnpm`)
- **Anthropic API key** with credits ([console.anthropic.com](https://console.anthropic.com))

## Quick Start

```bash
cd mvp
pnpm install
```

### Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your `ANTHROPIC_API_KEY`. The other values can be generated:

```bash
# Generate MPP secret key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate wallet keys (optional — auto-generated if not set)
node --import=tsx/esm -e "import {generatePrivateKey} from 'viem/accounts'; console.log(generatePrivateKey()); console.log(generatePrivateKey())"
```

### Run the demo

You need two terminals.

**Terminal 1 - Start the provider:**

```bash
cd mvp
pnpm provider
```

The provider will:
- Start a libp2p node on port 4001
- Initialize a Tempo testnet wallet (auto-funded via faucet on first run)
- Start an MPP-gated HTTP server on port 3100
- Listen for incoming data requests

**Terminal 2 - Start the requester:**

```bash
cd mvp
pnpm requester
```

The requester will connect to the provider and present an interactive prompt.

### Interactive commands

```
dan> search NYC weather data 2024
```

The provider's LLM will match this against its catalog and send an offer. You'll see something like:

```
[offer #1] from 12D3KooW...
  Dataset: "Daily weather observations for New York City, Jan-Dec 2024..."
  Records: 365, Price: 50000
  > "accept 1" / "reject 1" / "ask 1 <question>"
```

Then:

```
dan> accept 1
```

This triggers the full payment flow:
1. Requester sends Accept over libp2p
2. Provider provisions a delivery URL, sends Confirm
3. Requester fetches the URL, gets a 402 payment challenge
4. mppx client automatically signs a Tempo payment
5. Retries with payment proof, receives the dataset

You can also:

```
dan> ask 1 what date range does this cover?    # Ask about an offer
dan> reject 1 too expensive                     # Reject with reason
dan> search S&P 500 stock data                  # Search for other data
dan> quit                                        # Exit
```

## Mock Data Catalog

The provider serves two datasets:

| Dataset | Records | Price |
|---------|---------|-------|
| `nyc-weather-2024` - Daily NYC weather (temp, humidity, precipitation, wind) | 365 | 0.05 pathUSD |
| `sp500-daily-2024` - Daily S&P 500 index (open, high, low, close, volume) | 252 | 0.10 pathUSD |

## Architecture

```
mvp/src/
  node.ts              # Entry point — provider daemon or requester REPL
  network.ts           # libp2p node factory (TCP, Noise, Yamux, GossipSub)
  catalog.ts           # Data catalog + LLM-powered intent matching
  wallet.ts            # Tempo testnet wallet management
  protocol/
    types.ts           # DAN/1.0.0 message types (RFQ, Offer, Clarify, Accept, Reject, Confirm)
    codec.ts           # Length-prefixed JSON serialization over libp2p streams
    ids.ts             # Protocol constants and topic names
    rfq.ts             # GossipSub publish/subscribe for RFQs
    offer.ts           # Direct stream: provider -> requester offers
    clarify.ts         # Bidirectional clarification flow
    accept.ts          # Accept/reject + confirm with delivery endpoint
  data/
    mock.ts            # Mock data generators (weather, stocks)
  http/
    server.ts          # Hono HTTP server with MPP payment gating
```

## DAN Protocol (dan/1.0.0)

Seven message types over two transports:

| Message | Transport | Direction | Purpose |
|---------|-----------|-----------|---------|
| **RFQ** | GossipSub pubsub | Broadcast | "I need data about X" |
| **Offer** | Direct stream | Provider -> Requester | "I have dataset Y for price Z" |
| **Clarify** | Direct stream | Either direction | "Can you tell me more about...?" |
| **ClarifyReply** | Direct stream | Either direction | Response to clarification |
| **Accept** | Direct stream | Requester -> Provider | "I'll take that offer" |
| **Reject** | Direct stream | Requester -> Provider | "No thanks" |
| **Confirm** | Direct stream | Provider -> Requester | "Here's your delivery URL" |

## Payments

Payments use Tempo's testnet (Moderato, chain ID 42431) with pathUSD stablecoin. The faucet automatically funds wallets with 1,000,000 pathUSD on first run.

The payment flow is handled by [mppx](https://github.com/tempoxyz/mppx) (Machine Payment Protocol):
- Server responds with `402 Payment Required` + challenge in `WWW-Authenticate` header
- Client signs a payment transaction on Tempo
- Client retries with payment proof in `Authorization` header
- Server verifies payment and serves the data

No manual wallet management needed — everything is automatic.
