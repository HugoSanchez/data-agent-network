import { ACCEPT_PROTOCOL } from './ids.js'
import { envelope, wrapStream, writeMsg, readMsg, readMessage, writeMessage } from './codec.js'
import type { Accept, Reject, Confirm } from './types.js'
import type { DANNode } from '../network.js'
import { peerIdFromString } from '@libp2p/peer-id'

/**
 * Send an Accept message to the provider. Returns the Confirm with the HTTP endpoint.
 */
export async function sendAccept(
  node: DANNode,
  providerPeerId: string,
  intentId: string,
  offerId: string,
): Promise<Confirm> {
  const msg: Accept = {
    ...envelope('accept', intentId),
    offerId,
    requesterPeerId: node.peerId.toString(),
  }

  const peerId = peerIdFromString(providerPeerId)
  const stream = await node.dialProtocol(peerId, ACCEPT_PROTOCOL)

  // Use bidirectional stream: write accept, then read confirm back
  const lp = wrapStream(stream)
  await writeMsg(lp, msg)
  const confirm = await readMsg(lp) as Confirm
  await (lp.unwrap() as any).close()

  return confirm
}

/**
 * Send a Reject message to the provider.
 */
export async function sendReject(
  node: DANNode,
  providerPeerId: string,
  intentId: string,
  offerId: string,
  reason?: string,
): Promise<void> {
  const msg: Reject = {
    ...envelope('reject', intentId),
    offerId,
    reason,
    requesterPeerId: node.peerId.toString(),
  }

  const peerId = peerIdFromString(providerPeerId)
  const stream = await node.dialProtocol(peerId, ACCEPT_PROTOCOL)
  await writeMessage(stream, msg)
}

/**
 * Register handler for incoming accept/reject messages (provider side).
 * onAccept should return the HTTP endpoint for data delivery.
 */
export function onAcceptReject(
  node: DANNode,
  handlers: {
    onAccept: (msg: Accept) => Promise<{ uuid: string; endpoint: string }>
    onReject?: (msg: Reject) => void
  },
): void {
  node.handle(ACCEPT_PROTOCOL, async ({ stream }) => {
    const lp = wrapStream(stream)
    const msg = await readMsg(lp)

    if (msg.type === 'accept') {
      const accept = msg as Accept
      const { uuid, endpoint } = await handlers.onAccept(accept)

      const confirm: Confirm = {
        ...envelope('confirm', accept.intentId),
        offerId: accept.offerId,
        uuid,
        endpoint,
        providerPeerId: node.peerId.toString(),
      }

      // Send Confirm back on the same stream
      await writeMsg(lp, confirm)
      await (lp.unwrap() as any).close()
    } else if (msg.type === 'reject') {
      handlers.onReject?.(msg as Reject)
      await (lp.unwrap() as any).close()
    }
  })
}
