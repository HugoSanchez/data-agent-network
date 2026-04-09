import { CLARIFY_PROTOCOL } from './ids.js'
import { envelope, newId, readMessage, writeMessage } from './codec.js'
import type { Clarify, ClarifyReply } from './types.js'
import type { DANNode } from '../network.js'
import { peerIdFromString } from '@libp2p/peer-id'

/**
 * Send a clarification question to a peer.
 */
export async function sendClarify(
  node: DANNode,
  toPeerId: string,
  intentId: string,
  question: string,
  offerId?: string,
): Promise<Clarify> {
  const msg: Clarify = {
    ...envelope('clarify', intentId),
    offerId,
    question,
    fromPeerId: node.peerId.toString(),
  }

  const peerId = peerIdFromString(toPeerId)
  const stream = await node.dialProtocol(peerId, CLARIFY_PROTOCOL)
  await writeMessage(stream, msg)

  return msg
}

/**
 * Send a reply to a clarification question.
 */
export async function sendClarifyReply(
  node: DANNode,
  toPeerId: string,
  intentId: string,
  replyTo: string,
  answer: string,
  offerId?: string,
): Promise<ClarifyReply> {
  const msg: ClarifyReply = {
    ...envelope('clarify-reply', intentId),
    offerId,
    replyTo,
    answer,
    fromPeerId: node.peerId.toString(),
  }

  const peerId = peerIdFromString(toPeerId)
  const stream = await node.dialProtocol(peerId, CLARIFY_PROTOCOL)
  await writeMessage(stream, msg)

  return msg
}

/**
 * Register handler for incoming clarify/clarify-reply messages.
 */
export function onClarify(
  node: DANNode,
  handlers: {
    onQuestion?: (msg: Clarify) => void
    onReply?: (msg: ClarifyReply) => void
  },
): void {
  node.handle(CLARIFY_PROTOCOL, async ({ stream }) => {
    const msg = await readMessage(stream)
    if (msg.type === 'clarify') {
      handlers.onQuestion?.(msg as Clarify)
    } else if (msg.type === 'clarify-reply') {
      handlers.onReply?.(msg as ClarifyReply)
    }
  })
}
