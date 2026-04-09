import { lpStream, type LengthPrefixedStream } from 'it-length-prefixed-stream'
import { randomUUID } from 'node:crypto'
import { PROTOCOL_VERSION } from './ids.js'
import type { DANMessage, MessageType } from './types.js'

/**
 * Wrap a raw libp2p stream in a length-prefixed stream for reading/writing messages.
 */
export function wrapStream(stream: any): LengthPrefixedStream {
  return lpStream(stream)
}

/**
 * Write a single message to a length-prefixed stream.
 */
export async function writeMsg(lp: LengthPrefixedStream, message: DANMessage): Promise<void> {
  const buf = new TextEncoder().encode(JSON.stringify(message))
  await lp.write(buf)
}

/**
 * Read a single message from a length-prefixed stream.
 */
export async function readMsg(lp: LengthPrefixedStream): Promise<DANMessage> {
  const res = await lp.read()
  const bytes = res instanceof Uint8Array ? res : Uint8Array.from(res.subarray())
  const text = new TextDecoder().decode(bytes)
  return JSON.parse(text) as DANMessage
}

/**
 * Write a single message and close the stream. For one-shot messages (offer, clarify, etc).
 */
export async function writeMessage(stream: any, message: DANMessage): Promise<void> {
  const lp = wrapStream(stream)
  await writeMsg(lp, message)
  await (lp.unwrap() as any).close()
}

/**
 * Read a single message from a stream. For one-shot messages.
 */
export async function readMessage(stream: any): Promise<DANMessage> {
  const lp = wrapStream(stream)
  const res = await lp.read()
  const bytes = res instanceof Uint8Array ? res : Uint8Array.from(res.subarray())
  const text = new TextDecoder().decode(bytes)
  return JSON.parse(text) as DANMessage
}

/**
 * Create a new message ID.
 */
export function newId(): string {
  return randomUUID()
}

/**
 * Create the common envelope fields for a new message.
 */
export function envelope<T extends MessageType>(type: T, intentId: string) {
  return {
    protocol: PROTOCOL_VERSION as 'dan/1.0.0',
    type,
    id: newId(),
    intentId,
    timestamp: Date.now(),
  }
}
