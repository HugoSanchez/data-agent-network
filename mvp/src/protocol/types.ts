export type MessageType = 'rfq' | 'offer' | 'clarify' | 'clarify-reply' | 'accept' | 'reject' | 'confirm'

export interface MessageEnvelope {
  protocol: 'dan/1.0.0'
  type: MessageType
  id: string        // unique message ID
  intentId: string  // ties all messages in a negotiation together
  timestamp: number // unix ms
}

export interface RFQ extends MessageEnvelope {
  type: 'rfq'
  query: string
  compute?: string
  requesterPeerId: string
}

export interface Offer extends MessageEnvelope {
  type: 'offer'
  offerId: string
  datasetId: string
  description: string
  records: number
  price: string     // smallest unit, as string
  currency: string  // TIP-20 address
  providerPeerId: string
}

export interface Clarify extends MessageEnvelope {
  type: 'clarify'
  offerId?: string
  question: string
  fromPeerId: string
}

export interface ClarifyReply extends MessageEnvelope {
  type: 'clarify-reply'
  offerId?: string
  replyTo: string   // id of the Clarify message being answered
  answer: string
  fromPeerId: string
}

export interface Accept extends MessageEnvelope {
  type: 'accept'
  offerId: string
  requesterPeerId: string
}

export interface Reject extends MessageEnvelope {
  type: 'reject'
  offerId: string
  reason?: string
  requesterPeerId: string
}

export interface Confirm extends MessageEnvelope {
  type: 'confirm'
  offerId: string
  uuid: string      // unique transaction ID for this delivery
  endpoint: string  // HTTP URL for paid data delivery
  providerPeerId: string
}

export type DANMessage = RFQ | Offer | Clarify | ClarifyReply | Accept | Reject | Confirm
