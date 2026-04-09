import { OFFER_PROTOCOL } from './ids.js'
import { envelope, newId, readMessage, writeMessage } from './codec.js'
import type { Offer } from './types.js'
import type { DANNode } from '../network.js'
import type { DatasetEntry } from '../catalog.js'
import { peerIdFromString } from '@libp2p/peer-id'

/**
 * Send an offer to the requester via direct stream.
 */
export async function sendOffer(
  node: DANNode,
  requesterPeerId: string,
  intentId: string,
  dataset: DatasetEntry,
): Promise<Offer> {
  const offer: Offer = {
    ...envelope('offer', intentId),
    offerId: newId(),
    datasetId: dataset.id,
    description: dataset.description,
    records: dataset.records,
    price: dataset.price,
    currency: dataset.currency,
    providerPeerId: node.peerId.toString(),
  }

  const peerId = peerIdFromString(requesterPeerId)
  const stream = await node.dialProtocol(peerId, OFFER_PROTOCOL)
  await writeMessage(stream, offer)

  return offer
}

/**
 * Register handler for incoming offers (requester side).
 */
export function onOffer(node: DANNode, handler: (offer: Offer) => void): void {
  node.handle(OFFER_PROTOCOL, async ({ stream }) => {
    const msg = await readMessage(stream)
    if (msg.type === 'offer') {
      handler(msg as Offer)
    }
  })
}
