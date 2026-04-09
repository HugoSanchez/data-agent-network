import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import type { PrivateKeyAccount } from 'viem/accounts'

export const tempoTestnet = defineChain({
  id: 42431,
  name: 'Tempo Testnet (Moderato)',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.moderato.tempo.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Tempo Explorer', url: 'https://explore.testnet.tempo.xyz' },
  },
  testnet: true,
})

export const PATH_USD = '0x20c0000000000000000000000000000000000000' as const

const RPC_URL = 'https://rpc.moderato.tempo.xyz'

/**
 * Create or load a wallet account.
 * Uses role-specific env var (PROVIDER_PRIVATE_KEY / REQUESTER_PRIVATE_KEY),
 * falls back to PRIVATE_KEY, or generates a new key.
 */
export function loadAccount(role?: 'provider' | 'requester'): PrivateKeyAccount {
  const key =
    (role === 'provider' && process.env.PROVIDER_PRIVATE_KEY) ||
    (role === 'requester' && process.env.REQUESTER_PRIVATE_KEY) ||
    process.env.PRIVATE_KEY ||
    generatePrivateKey()

  const isGenerated = !process.env.PROVIDER_PRIVATE_KEY && !process.env.REQUESTER_PRIVATE_KEY && !process.env.PRIVATE_KEY
  if (isGenerated) {
    console.log('[wallet] Generated ephemeral key (set PROVIDER/REQUESTER_PRIVATE_KEY in .env to persist)')
  }
  return privateKeyToAccount(key as `0x${string}`)
}

/**
 * Fund an address on Tempo testnet via the faucet RPC method.
 */
export async function fundWallet(address: string): Promise<void> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tempo_fundAddress',
      params: [address],
      id: 1,
    }),
  })

  const json = await res.json() as any
  if (json.error) {
    throw new Error(`Faucet error: ${json.error.message || JSON.stringify(json.error)}`)
  }
}

/**
 * Get the pathUSD balance for an address.
 */
export async function getBalance(address: string): Promise<string> {
  const client = createPublicClient({
    chain: tempoTestnet,
    transport: http(RPC_URL),
  })

  const balance = await client.readContract({
    address: PATH_USD,
    abi: [{
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    }],
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  }) as bigint

  // pathUSD has 6 decimals
  const whole = balance / 1_000_000n
  const frac = (balance % 1_000_000n).toString().padStart(6, '0')
  return `${whole}.${frac}`
}

/**
 * Initialize wallet: load/generate key, fund from faucet, log balance.
 */
export async function initWallet(role?: 'provider' | 'requester'): Promise<PrivateKeyAccount> {
  const account = loadAccount(role)
  console.log(`[wallet] Address: ${account.address}`)

  try {
    const existingBalance = await getBalance(account.address)
    if (existingBalance !== '0.000000') {
      console.log(`[wallet] Balance: ${existingBalance} pathUSD (already funded)`)
    } else {
      console.log('[wallet] Requesting testnet funds...')
      await fundWallet(account.address)
      // Wait for funding txs to be included in a block
      await new Promise((r) => setTimeout(r, 2000))
      const balance = await getBalance(account.address)
      console.log(`[wallet] Balance: ${balance} pathUSD`)
    }
  } catch (err: any) {
    console.log(`[wallet] Faucet warning: ${err.message}`)
    console.log('[wallet] Continuing without funding (may already be funded)')
  }

  return account
}
