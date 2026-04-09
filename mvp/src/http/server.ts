import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { Mppx, tempo } from 'mppx/hono'
import { getDataset } from '../data/mock.js'
import { PATH_USD } from '../wallet.js'
import type { PrivateKeyAccount } from 'viem/accounts'

export const HTTP_PORT = 3100

interface PendingDelivery {
  datasetId: string
  offerId: string
  price: string
}

const deliveries = new Map<string, PendingDelivery>()

/**
 * Register a delivery endpoint for a given UUID + dataset.
 */
export function registerDelivery(uuid: string, datasetId: string, offerId: string, price: string): string {
  deliveries.set(uuid, { datasetId, offerId, price })
  return `http://127.0.0.1:${HTTP_PORT}/data/${uuid}`
}

/**
 * Start the HTTP server with MPP payment gating.
 */
export function startHttpServer(account: PrivateKeyAccount): void {
  const mppx = Mppx.create({
    methods: [
      tempo.charge({
        currency: PATH_USD,
        recipient: account.address,
        testnet: true,
        rpcUrl: { 42431: 'https://rpc.moderato.tempo.xyz' },
      } as any),
    ],
  })

  const app = new Hono()

  // Payment-gated data delivery: split into middleware + handler
  app.use('/data/:uuid', async (c, next) => {
    const uuid = c.req.param('uuid')
    const delivery = deliveries.get(uuid)

    if (!delivery) {
      return c.json({ error: 'Not found' }, 404)
    }

    const priceInTokens = (Number(delivery.price) / 1_000_000).toString()
    const chargeMiddleware = mppx.charge({ amount: priceInTokens, currency: PATH_USD })
    return chargeMiddleware(c, next)
  })

  app.get('/data/:uuid', (c) => {
    const uuid = c.req.param('uuid')
    const delivery = deliveries.get(uuid)!

    const data = getDataset(delivery.datasetId)
    if (!data) {
      return c.json({ error: 'Dataset not found' }, 500)
    }

    return c.json({
      datasetId: delivery.datasetId,
      records: data.length,
      data,
    })
  })

  serve({ fetch: app.fetch, port: HTTP_PORT })
  console.log(`[http] Data server listening on http://127.0.0.1:${HTTP_PORT} (MPP-gated)`)
}
