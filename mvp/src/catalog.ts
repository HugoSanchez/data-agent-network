import Anthropic from '@anthropic-ai/sdk'

export interface DatasetEntry {
  id: string
  description: string
  keywords: string[]
  records: number
  price: string   // in smallest unit
  currency: string // TIP-20 address (pathUSD)
}

// Mock catalog — in a real system this would be loaded from a file or database
export const MOCK_CATALOG: DatasetEntry[] = [
  {
    id: 'nyc-weather-2024',
    description: 'Daily weather observations for New York City, Jan–Dec 2024. Includes temperature (high/low/avg), humidity, precipitation, and wind speed.',
    keywords: ['weather', 'nyc', 'new york', 'temperature', 'climate', '2024'],
    records: 365,
    price: '50000', // 0.05 pathUSD (6 decimals)
    currency: '0x20c0000000000000000000000000000000000000', // pathUSD
  },
  {
    id: 'sp500-daily-2024',
    description: 'Daily S&P 500 index data for 2024. Includes open, high, low, close, and volume.',
    keywords: ['stocks', 'sp500', 'finance', 'market', 'equities', '2024'],
    records: 252,
    price: '100000', // 0.10 pathUSD
    currency: '0x20c0000000000000000000000000000000000000',
  },
]

const anthropic = new Anthropic()

export type MatchResult =
  | { type: 'match'; dataset: DatasetEntry }
  | { type: 'clarify'; question: string }
  | { type: 'none' }

/**
 * Simple keyword-based fallback matcher (no LLM needed).
 */
function keywordMatch(query: string, catalog: DatasetEntry[]): MatchResult {
  const q = query.toLowerCase()
  for (const dataset of catalog) {
    const hit = dataset.keywords.some((kw) => q.includes(kw))
    if (hit) return { type: 'match', dataset }
  }
  return { type: 'none' }
}

/**
 * Match an RFQ query against the catalog.
 * Tries LLM first, falls back to keyword matching if the API is unavailable.
 */
export async function matchIntent(
  query: string,
  catalog: DatasetEntry[] = MOCK_CATALOG,
  context?: string,
): Promise<MatchResult> {
  try {
    return await matchIntentLLM(query, catalog, context)
  } catch (err: any) {
    console.log(`[catalog] LLM unavailable (${err.message?.slice(0, 60)}), using keyword fallback`)
    return keywordMatch(query, catalog)
  }
}

async function matchIntentLLM(
  query: string,
  catalog: DatasetEntry[],
  context?: string,
): Promise<MatchResult> {
  const catalogDescription = catalog
    .map((d, i) => `[${i}] id: "${d.id}" — ${d.description} (${d.records} records)`)
    .join('\n')

  const contextBlock = context ? `\n\nAdditional context from requester: "${context}"` : ''

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 150,
    system: `You are a data catalog matcher. Given a data request and a catalog, respond in one of three ways:
- If a dataset clearly matches: respond with just the index number (e.g. "0")
- If you need more info to decide: respond with "clarify: <your question>" (e.g. "clarify: Do you need daily or hourly granularity?")
- If nothing matches: respond with "none"
No other text.`,
    messages: [
      {
        role: 'user',
        content: `Request: "${query}"\n\nCatalog:\n${catalogDescription}${contextBlock}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  if (text === 'none') return { type: 'none' }

  if (text.startsWith('clarify:')) {
    return { type: 'clarify', question: text.slice('clarify:'.length).trim() }
  }

  const index = parseInt(text, 10)
  if (isNaN(index) || index < 0 || index >= catalog.length) return { type: 'none' }

  return { type: 'match', dataset: catalog[index] }
}

/**
 * Use LLM to answer a requester's question about a specific dataset.
 */
export async function answerQuestion(dataset: DatasetEntry, question: string): Promise<string> {
  try {
    return await answerQuestionLLM(dataset, question)
  } catch (err: any) {
    return `[LLM unavailable] Dataset "${dataset.id}": ${dataset.description}`
  }
}

async function answerQuestionLLM(dataset: DatasetEntry, question: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 200,
    system: `You are a data provider answering questions about your dataset. Be concise and factual. Only answer based on the dataset description provided — don't invent details.`,
    messages: [
      {
        role: 'user',
        content: `Dataset: "${dataset.id}" — ${dataset.description} (${dataset.records} records, price: ${dataset.price})\n\nQuestion from requester: "${question}"`,
      },
    ],
  })

  return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
}
