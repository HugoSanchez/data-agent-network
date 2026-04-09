// Mock datasets — in a real system these would come from files, databases, or APIs

export interface WeatherRecord {
  date: string
  tempHighF: number
  tempLowF: number
  tempAvgF: number
  humidity: number
  precipInches: number
  windSpeedMph: number
}

export function generateNYCWeather2024(): WeatherRecord[] {
  const records: WeatherRecord[] = []
  const startDate = new Date('2024-01-01')

  for (let i = 0; i < 365; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)
    const month = date.getMonth() // 0-11

    // Seasonal temperature patterns (rough NYC averages)
    const seasonalBase = [32, 35, 43, 55, 65, 75, 80, 78, 70, 58, 45, 35][month]
    const variance = Math.random() * 10 - 5

    const tempAvg = Math.round(seasonalBase + variance)
    const tempHigh = tempAvg + Math.round(Math.random() * 8 + 4)
    const tempLow = tempAvg - Math.round(Math.random() * 8 + 4)

    records.push({
      date: date.toISOString().split('T')[0],
      tempHighF: tempHigh,
      tempLowF: tempLow,
      tempAvgF: tempAvg,
      humidity: Math.round(50 + Math.random() * 30),
      precipInches: Math.round(Math.random() * 100) / 100,
      windSpeedMph: Math.round(5 + Math.random() * 15),
    })
  }

  return records
}

export function generateSP500Daily2024() {
  const records = []
  const startDate = new Date('2024-01-02')
  let close = 4770 // approximate SP500 start of 2024

  for (let i = 0; i < 252; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + Math.floor(i * 365 / 252))

    const change = (Math.random() - 0.48) * 40 // slight upward bias
    const open = close
    close = Math.round((close + change) * 100) / 100
    const high = Math.max(open, close) + Math.round(Math.random() * 20 * 100) / 100
    const low = Math.min(open, close) - Math.round(Math.random() * 20 * 100) / 100
    const volume = Math.round(3_000_000_000 + Math.random() * 2_000_000_000)

    records.push({
      date: date.toISOString().split('T')[0],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    })
  }

  return records
}

const DATASET_GENERATORS: Record<string, () => any[]> = {
  'nyc-weather-2024': generateNYCWeather2024,
  'sp500-daily-2024': generateSP500Daily2024,
}

export function getDataset(datasetId: string): any[] | null {
  const gen = DATASET_GENERATORS[datasetId]
  return gen ? gen() : null
}
