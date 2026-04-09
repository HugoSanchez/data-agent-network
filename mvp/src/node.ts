import { createInterface } from 'node:readline'
import { multiaddr } from '@multiformats/multiaddr'
import { randomUUID } from 'node:crypto'
import { createNode, DEFAULT_PORT } from './network.js'
import { subscribeToRFQs, publishRFQ } from './protocol/rfq.js'
import { sendOffer, onOffer } from './protocol/offer.js'
import { sendClarify, sendClarifyReply, onClarify } from './protocol/clarify.js'
import { sendAccept, sendReject, onAcceptReject } from './protocol/accept.js'
import { matchIntent, answerQuestion, MOCK_CATALOG } from './catalog.js'
import { startHttpServer, registerDelivery } from './http/server.js'
import { initWallet } from './wallet.js'
import { Mppx, tempo } from 'mppx/client'
import type { RFQ, Offer, Clarify } from './protocol/types.js'

const args = process.argv.slice(2)
const role = args.includes('--provider') ? 'provider' : args.includes('--requester') ? 'requester' : null

if (!role) {
  console.log('Usage:')
  console.log('  pnpm dev -- --provider     Start as provider (daemon)')
  console.log('  pnpm dev -- --requester    Start as requester (interactive)')
  process.exit(1)
}

console.log(`DAN MVP — Data Agent Network [${role}]`)
console.log('Starting node...\n')

const isProvider = role === 'provider'

const node = await createNode({
  listenPort: isProvider ? DEFAULT_PORT : 0,
})

console.log(`Peer ID:  ${node.peerId.toString()}`)
for (const addr of node.getMultiaddrs()) {
  console.log(`Listening: ${addr.toString()}`)
}
console.log('')

// Initialize wallet for both roles
const account = await initWallet(role as 'provider' | 'requester')
console.log('')

if (isProvider) {
  // ── Provider: autonomous daemon ──
  startHttpServer(account)

  const pendingRFQs = new Map<string, { rfq: RFQ; context: string[] }>()
  const sentOffers = new Map<string, { offer: Offer; dataset: typeof MOCK_CATALOG[0] }>()

  console.log(`Catalog: ${MOCK_CATALOG.map(d => d.id).join(', ')}`)
  console.log('Listening for RFQs...\n')

  onAcceptReject(node, {
    onAccept: async (accept) => {
      const offerEntry = sentOffers.get(accept.offerId)
      if (!offerEntry) throw new Error(`Unknown offer: ${accept.offerId}`)

      console.log(`[accept] Offer ${accept.offerId} accepted by ${accept.requesterPeerId}`)
      const uuid = randomUUID()
      const endpoint = registerDelivery(uuid, offerEntry.dataset.id, accept.offerId, offerEntry.dataset.price)
      console.log(`         Provisioned: ${endpoint}\n`)
      return { uuid, endpoint }
    },
    onReject: (reject) => {
      console.log(`[reject] Offer ${reject.offerId} rejected${reject.reason ? `: "${reject.reason}"` : ''}\n`)
      sentOffers.delete(reject.offerId)
    },
  })

  onClarify(node, {
    onReply: async (reply) => {
      console.log(`[clarify-reply] "${reply.answer}" from ${reply.fromPeerId}`)
      const pending = pendingRFQs.get(reply.intentId)
      if (!pending) return

      pending.context.push(reply.answer)
      const fullContext = pending.context.join('; ')
      console.log('       Re-matching with additional context...')
      const result = await matchIntent(pending.rfq.query, MOCK_CATALOG, fullContext)

      if (result.type === 'match') {
        console.log(`       Match found: "${result.dataset.id}" — sending offer`)
        const offer = await sendOffer(node, pending.rfq.requesterPeerId, pending.rfq.intentId, result.dataset)
        sentOffers.set(offer.offerId, { offer, dataset: result.dataset })
        console.log(`       Offer sent (offerId: ${offer.offerId})\n`)
        pendingRFQs.delete(reply.intentId)
      } else if (result.type === 'clarify') {
        console.log(`       Still need info — asking: "${result.question}"`)
        await sendClarify(node, pending.rfq.requesterPeerId, pending.rfq.intentId, result.question)
      } else {
        console.log('       Still no match after clarification.\n')
        pendingRFQs.delete(reply.intentId)
      }
    },
    onQuestion: async (msg) => {
      console.log(`[clarify] Requester asks: "${msg.question}"`)
      const offerEntry = msg.offerId ? sentOffers.get(msg.offerId) : null
      if (!offerEntry) {
        console.log('       No matching offer found for this question.\n')
        return
      }
      console.log('       Generating answer...')
      const answer = await answerQuestion(offerEntry.dataset, msg.question)
      console.log(`       Answer: "${answer}"`)
      await sendClarifyReply(node, msg.fromPeerId, msg.intentId, msg.id, answer, msg.offerId)
      console.log('       Reply sent.\n')
    },
  })

  subscribeToRFQs(node, async (rfq) => {
    try {
      console.log(`[rfq] Received: "${rfq.query}" from ${rfq.requesterPeerId}`)
      console.log('       Matching against catalog...')
      const result = await matchIntent(rfq.query)

      if (result.type === 'match') {
        console.log(`       Match found: "${result.dataset.id}" — sending offer`)
        const offer = await sendOffer(node, rfq.requesterPeerId, rfq.intentId, result.dataset)
        sentOffers.set(offer.offerId, { offer, dataset: result.dataset })
        console.log(`       Offer sent (offerId: ${offer.offerId}, price: ${offer.price})\n`)
      } else if (result.type === 'clarify') {
        console.log(`       Need clarification — asking: "${result.question}"`)
        pendingRFQs.set(rfq.intentId, { rfq, context: [] })
        await sendClarify(node, rfq.requesterPeerId, rfq.intentId, result.question)
        console.log('       Clarification sent, waiting for reply...\n')
      } else {
        console.log('       No matching dataset found.\n')
      }
    } catch (err: any) {
      console.log(`       Error handling RFQ: ${err.message}\n`)
    }
  })
} else {
  // ── Requester: interactive REPL ──

  // State: track received offers and pending clarifications
  const offers = new Map<number, Offer>()
  const pendingClarify = new Map<string, Clarify>() // intentId → last clarify question
  const respondedIntents = new Set<string>() // intentIds that got a response
  let offerCounter = 0

  onOffer(node, (offer) => {
    respondedIntents.add(offer.intentId)
    offerCounter++
    offers.set(offerCounter, offer)
    console.log(`\n[offer #${offerCounter}] from ${offer.providerPeerId.slice(0, 16)}...`)
    console.log(`  Dataset: "${offer.description}"`)
    console.log(`  Records: ${offer.records}, Price: ${offer.price}`)
    console.log(`  → "accept ${offerCounter}" / "reject ${offerCounter}" / "ask ${offerCounter} <question>"`)
    rl.prompt()
  })

  onClarify(node, {
    onQuestion: (msg) => {
      respondedIntents.add(msg.intentId)
      pendingClarify.set(msg.intentId, msg)
      console.log(`\n[clarify] Provider asks: "${msg.question}"`)
      console.log(`  → "reply ${msg.question.length > 30 ? '...' : ''} <your answer>"`)
      rl.prompt()
    },
    onReply: (msg) => {
      console.log(`\n[answer] Provider says: "${msg.answer}"`)
      rl.prompt()
    },
  })

  // Set up mppx client for paid data fetches
  const mppx = Mppx.create({
    methods: [tempo.charge({ account, rpcUrl: { 42431: 'https://rpc.moderato.tempo.xyz' } } as any)],
    polyfill: false,
  })
  const paidFetch = mppx.fetch

  subscribeToRFQs(node, () => {})

  const providerAddr = multiaddr(`/ip4/127.0.0.1/tcp/${DEFAULT_PORT}`)

  console.log('Connecting to provider...')
  const conn = await node.dial(providerAddr)
  console.log(`Connected to provider: ${conn.remotePeer.toString()}`)
  console.log('Waiting for mesh formation...')
  await new Promise((r) => setTimeout(r, 3000))

  // Auto-reconnect on disconnect
  node.addEventListener('peer:disconnect', async () => {
    console.log('\n[reconnecting...]')
    try {
      await node.dial(providerAddr)
      await new Promise((r) => setTimeout(r, 2000))
      console.log('[reconnected]')
      rl.prompt()
    } catch { /* will retry on next disconnect or user action */ }
  })

  console.log('\nReady! Commands:')
  console.log('  search <query>         Broadcast an RFQ')
  console.log('  accept <#>             Accept offer and fetch data')
  console.log('  reject <#> [reason]    Reject offer')
  console.log('  ask <#> <question>     Ask about an offer')
  console.log('  reply <answer>         Reply to provider clarification')
  console.log('  quit                   Exit\n')

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'dan> ' })
  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }

    const [cmd, ...rest] = input.split(' ')
    const arg = rest.join(' ')

    try {
      switch (cmd) {
        case 'search': {
          if (!arg) { console.log('Usage: search <query>'); break }
          console.log('Broadcasting RFQ...')
          const rfq = await publishRFQ(node, arg)
          console.log(`Published: "${rfq.query}" (intentId: ${rfq.intentId})`)
          console.log('Waiting for offers...')
          setTimeout(() => {
            if (!respondedIntents.has(rfq.intentId)) {
              console.log(`\nNo offers received for "${rfq.query}". No providers matched your request.`)
              rl.prompt()
            }
          }, 15_000)
          break
        }

        case 'accept': {
          const num = parseInt(rest[0], 10)
          const offer = offers.get(num)
          if (!offer) { console.log(`No offer #${num}. Use "search" first.`); break }

          console.log(`Accepting offer #${num}...`)
          const confirm = await sendAccept(node, offer.providerPeerId, offer.intentId, offer.offerId)
          console.log(`Deal confirmed! Paying & fetching data...`)

          const resp = await paidFetch(confirm.endpoint)
          if (!resp.ok) {
            const body = await resp.text()
            console.log(`Fetch failed (${resp.status}): ${body.slice(0, 200)}`)
            break
          }
          const data = await resp.json() as any
          console.log(`\nReceived ${data.records} records from "${data.datasetId}"`)
          console.log('Preview:')
          for (const record of data.data.slice(0, 5)) {
            console.log(`  ${JSON.stringify(record)}`)
          }
          if (data.records > 5) console.log(`  ... and ${data.records - 5} more`)
          break
        }

        case 'reject': {
          const num = parseInt(rest[0], 10)
          const offer = offers.get(num)
          if (!offer) { console.log(`No offer #${num}.`); break }
          const reason = rest.slice(1).join(' ') || undefined

          await sendReject(node, offer.providerPeerId, offer.intentId, offer.offerId, reason)
          console.log(`Offer #${num} rejected.`)
          offers.delete(num)
          break
        }

        case 'ask': {
          const num = parseInt(rest[0], 10)
          const offer = offers.get(num)
          if (!offer) { console.log(`No offer #${num}.`); break }
          const question = rest.slice(1).join(' ')
          if (!question) { console.log('Usage: ask <#> <question>'); break }

          console.log(`Asking provider...`)
          await sendClarify(node, offer.providerPeerId, offer.intentId, question, offer.offerId)
          break
        }

        case 'reply': {
          if (!arg) { console.log('Usage: reply <answer>'); break }
          // Find the most recent pending clarification
          const [intentId, clarifyMsg] = [...pendingClarify.entries()].pop() ?? []
          if (!clarifyMsg) { console.log('No pending clarification to reply to.'); break }

          await sendClarifyReply(node, clarifyMsg.fromPeerId, clarifyMsg.intentId, clarifyMsg.id, arg)
          pendingClarify.delete(intentId!)
          console.log('Reply sent. Waiting for offer...')
          break
        }

        case 'fetch': {
          const url = rest[0]
          if (!url) { console.log('Usage: fetch <url>'); break }
          console.log(`Fetching ${url}...`)
          const resp = await fetch(url)
          const data = await resp.json()
          console.log(`Got ${data.records} records from dataset "${data.datasetId}"`)
          // Print first 3 records as preview
          console.log('Preview:')
          for (const record of data.data.slice(0, 3)) {
            console.log(`  ${JSON.stringify(record)}`)
          }
          if (data.records > 3) console.log(`  ... and ${data.records - 3} more`)
          break
        }

        case 'quit':
        case 'exit': {
          console.log('Shutting down...')
          await node.stop()
          process.exit(0)
        }

        default:
          console.log(`Unknown command: ${cmd}. Try: search, accept, reject, ask, reply, fetch, quit`)
      }
    } catch (err: any) {
      console.log(`Error: ${err.message}`)
    }

    rl.prompt()
  })

  rl.on('close', async () => {
    console.log('\nShutting down...')
    await node.stop()
    process.exit(0)
  })
}

process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  await node.stop()
  process.exit(0)
})
