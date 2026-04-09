import { createLibp2p } from 'libp2p'
import type { Libp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'

export const DEFAULT_PORT = 4001

export interface NodeConfig {
  listenPort?: number
}

export type DANNode = Libp2p<{ pubsub: ReturnType<ReturnType<typeof gossipsub>> }>

export async function createNode(config: NodeConfig = {}): Promise<DANNode> {
  const port = config.listenPort ?? 0

  const node = await createLibp2p({
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${port}`],
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify() as any,
      pubsub: gossipsub({
        emitSelf: false,
        allowPublishToZeroTopicPeers: true,
      }) as any,
    },
  }) as unknown as DANNode

  node.addEventListener('peer:connect', (event) => {
    const peerId = event.detail
    console.log(`[connect] Connected to: ${peerId.toString()}`)
  })

  node.addEventListener('peer:disconnect', (event) => {
    const peerId = event.detail
    console.log(`[disconnect] Lost peer: ${peerId.toString()}`)
  })

  return node
}
