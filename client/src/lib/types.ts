// Shapes returned by the server (see the root README). Every number is a string.

export type Currency = 'TZS' | 'USD'
export type CostMethod = 'AVERAGE' | 'FIFO'
export type TransactionType = 'BUY' | 'SELL' | 'TRANSFER_IN'

export const CURRENCIES: Currency[] = ['TZS', 'USD']
export const TRANSACTION_TYPES: TransactionType[] = ['BUY', 'SELL', 'TRANSFER_IN']

export interface User {
  id: number
  email: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface Settings {
  displayCurrency: Currency
  costMethod: CostMethod
}

export interface Transaction {
  id: number
  type: TransactionType
  date: string
  sats: string
  btc: string
  fiatAmount: string
  feeAmount: string
  fiatCurrency: Currency
  usdTzsRate: string
  exchange: string | null
  note: string | null
  createdAt?: string
  updatedAt?: string
  /** Only on the POST /transactions response. */
  usdTzsRateSource?: FxSource | 'provided'
}

export interface TransactionList {
  data: Transaction[]
  page: number
  pageSize: number
  total: number
}

/** Body for POST /transactions and PATCH /transactions/:id. */
export interface TransactionInput {
  type: TransactionType
  date: string
  btc?: string
  sats?: string
  fiatAmount: string
  feeAmount: string
  fiatCurrency: Currency
  usdTzsRate: string
  exchange: string | null
  note: string | null
}

export interface PriceSnapshot {
  btcUsd: string
  usdTzs: string
  btcTzs: string
  timestamp: string
  stale: boolean
}

export interface CurrencyFigures {
  invested: string
  costBasis: string
  avgCostPerBtc: string | null
  realizedPnl: string
  currentValue: string | null
  unrealizedPnl: string | null
  unrealizedPnlPct: string | null
  totalPnl: string | null
}

export interface PortfolioSummary {
  costMethod: CostMethod
  transactionCount: number
  holdings: { sats: string; btc: string }
  price: PriceSnapshot | null
  USD: CurrencyFigures
  TZS: CurrencyFigures
}

export type FxSource = 'latest_snapshot' | 'historical_lookup'

export interface FxRate {
  date: string
  usdTzs: string
  source: FxSource
  asOf: string
}

/** details of a 422 caused by a sell exceeding holdings. */
export interface OverSellDetails {
  transactionId: number | null
  date: string
  attemptedSats: string
  availableSats: string
}
