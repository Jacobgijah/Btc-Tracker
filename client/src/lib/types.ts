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
  /** TZS only: the part of unrealizedPnl from BTC's USD price moving (null without a price). */
  btcEffect?: string | null
  /** TZS only: the part of unrealizedPnl from USD/TZS moving since you bought. */
  fxEffect?: string | null
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

// ---------------------------------------------------------------------------
// History and charts

export type HistoryRange = '1M' | '3M' | '6M' | '1Y' | 'ALL'
export const HISTORY_RANGES: HistoryRange[] = ['1M', '3M', '6M', '1Y', 'ALL']

/** Where a day's price came from; carried_forward = copied from an earlier day. */
export type PriceSource = 'daily' | 'live' | 'carried_forward'

/** One day of GET /portfolio/history, in the requested currency. Dates are "YYYY-MM-DD". */
export interface HistoryPoint {
  date: string
  holdingsSats: string
  btcUsd: string | null
  usdTzs: string | null
  priceSource: PriceSource | null
  transactionCount: number
  btcPrice: string | null
  costBasis: string
  currentValue: string | null
  unrealizedPnl: string | null
  unrealizedPnlPct: string | null
  realizedPnlCumulative: string
  avgCostPerBtc: string | null
  investedThatDay: string
}

export interface PortfolioHistory {
  range: HistoryRange
  currency: Currency
  costMethod: CostMethod
  timeZone: string
  from: string | null
  to: string
  totalDays: number
  pointCount: number
  downsampled: boolean
  daysWithCarriedForwardPrices: number
  daysWithoutPrice: number
  points: HistoryPoint[]
}

export interface MonthlyRow {
  /** "YYYY-MM" */
  month: string
  satsAcquired: string
  satsSold: string
  buyCount: number
  sellCount: number
  transferInCount: number
  invested: string
  received: string
  avgBuyPrice: string | null
}

export interface MonthlyReport {
  currency: Currency
  timeZone: string
  months: MonthlyRow[]
  summary: {
    monthsSaved: number
    currentStreak: number
    totalInvested: string
    averagePerMonth: string | null
  }
}

export interface MarketPrice {
  btcUsd: string
  usdTzs: string
  btcTzs: string
  source: PriceSource
}

export interface LedgerFigures {
  cost: string | null
  proceeds: string | null
  costBasis: string
  avgCostPerBtc: string | null
  costOfSold: string | null
  realizedPnl: string | null
}

/** GET /portfolio/ledger: a transaction plus the running position and the market price that day. */
export interface LedgerRow extends Transaction {
  day: string
  holdingsSats: string
  holdingsBtc: string
  marketPrice: MarketPrice | null
  USD: LedgerFigures
  TZS: LedgerFigures
}

/** details of a 422 caused by a sell exceeding holdings. */
export interface OverSellDetails {
  transactionId: number | null
  date: string
  attemptedSats: string
  availableSats: string
}
