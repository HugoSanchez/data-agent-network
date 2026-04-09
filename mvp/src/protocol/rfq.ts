import { RFQ_TOPIC } from './ids.js'
import { envelope, newId } from './codec.js'
import type { RFQ } from './types.js'
import type { DANNode } from '../network.js'

/**
 * Subscribe to incoming RFQs. Calls handler for each one.
 */
export function subscribeToRFQs(node: DANNode, handler: (rfq: RFQ) => void): void {
  node.services.pubsub.subscribe(RFQ_TOPIC)

  node.services.pubsub.addEventListener('message', (event) => {
    if (event.detail.topic !== RFQ_TOPIC) return

    const text = new TextDecoder().decode(event.detail.data)
    const rfq = JSON.parse(text) as RFQ
    handler(rfq)
  })
}

/**
 * Publish an RFQ to the network.
 */
export async function publishRFQ(
  node: DANNode,
  query: string,
  compute?: string,
): Promise<RFQ> {
  const intentId = newId()
  const rfq: RFQ = {
    ...envelope('rfq', intentId),
    query,
    compute,
    requesterPeerId: node.peerId.toString(),
  }

  const data = new TextEncoder().encode(JSON.stringify(rfq))
  await node.services.pubsub.publish(RFQ_TOPIC, data)

  return rfq
}
