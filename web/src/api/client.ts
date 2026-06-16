const BASE = '/api';

export interface Market {
  id: string;
  platform: string;
  question: string;
  outcomes: string[];
  prices: Record<string, number>;
  closeDate: string;
  volume?: number;
  liquidity?: number;
  metadata?: Record<string, unknown>;
}

export interface MarketDetailResponse {
  market: Market;
  crossPlatform?: {
    matchedId: string;
    matchedPlatform: string;
    confidence: number;
    method: string;
    matchedMarket: { question: string; prices: Record<string, number> } | null;
  };
  settlement?: {
    similarity: { question: number; criteria: number; timing: number; dataSource: number; overall: number };
    safeForArbitrage: boolean;
    riskFactors: string[];
  };
  priceHistory?: { timestamp: number; data: { prices: Record<string, number> } }[];
  metaculus?: {
    title: string;
    prediction: number;
    marketPrice: number;
    divergence: number;
    confidence: number;
  };
}

export interface Opportunity {
  id: number;
  opportunity_id: string;
  type: string;
  platform: string;
  market_id: string;
  market_question: string;
  gross_edge: number;
  net_edge: number;
  score: number;
  position_size: number;
  position_percent: number;
  liquidity: number;
  detected_at: number;
  close_date: string | null;
  score_breakdown: string;
}

export async function fetchMarkets(params: {
  platform?: string;
  search?: string;
  category?: string;
  limit?: number;
}): Promise<{ markets: Market[]; total: number; categories: string[] }> {
  const qs = new URLSearchParams();
  if (params.platform) qs.set('platform', params.platform);
  if (params.search) qs.set('search', params.search);
  if (params.category) qs.set('category', params.category);
  if (params.limit) qs.set('limit', String(params.limit));

  const res = await fetch(`${BASE}/markets?${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch markets: ${res.status}`);
  return res.json();
}

export async function fetchMarketDetail(
  platform: string,
  id: string
): Promise<MarketDetailResponse> {
  const res = await fetch(`${BASE}/markets/${encodeURIComponent(id)}?platform=${platform}`);
  if (!res.ok) throw new Error(`Failed to fetch market: ${res.status}`);
  return res.json();
}

export interface WatchlistItem {
  id: string;
  type: string;
  platform: string;
  marketId: string;
  marketQuestion: string;
  yesPrice: number;
  volume: number;
  liquidity: number;
  closeDate?: string;
  insight: string;
  category?: string;
}

export interface WatchlistResult {
  opportunities: WatchlistItem[];
  cached: boolean;
  stats?: Record<string, number>;
}

export async function scanForEdges(type?: string): Promise<WatchlistResult> {
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);

  const res = await fetch(`${BASE}/opportunities/scan?${qs}`);
  if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
  return res.json();
}

export interface FeedItem {
  id: string;
  platform: string;
  marketId: string;
  marketQuestion: string;
  yesPrice: number;
  volume: number;
  liquidity: number;
  closeDate?: string;
  category?: string;
  type: WatchlistItem['type'] | null;
  signal: number | null;
  divergence: number | null;
  matchedPlatform?: string;
  matchConfidence?: number;
}

export async function fetchFeed(): Promise<{ items: FeedItem[]; cached: boolean }> {
  const res = await fetch(`${BASE}/opportunities/feed`);
  if (!res.ok) throw new Error(`Feed failed: ${res.status}`);
  return res.json();
}

export interface EfficiencyPair {
  question: string;
  polymarketYes: number;
  kalshiYes: number;
  gap: number;
  netAfterFees: number;
  similarity: number;
  volume: number;
}

export interface EfficiencyStudy {
  generatedAt: string;
  universe: { polymarket: number; kalshi: number; total: number };
  matching: { similarityThreshold: number; matchedPairs: number };
  fees: { polymarket: number; kalshi: number; roundTrip: number };
  gapDistribution: { medianGap: number; meanGap: number; p90Gap: number; maxGap: number };
  actionable: { surfaced_3pp: number; beatsFees_9pp: number; meetsDetectorThreshold_19pp: number };
  pairs: EfficiencyPair[];
}

export async function fetchEfficiencyStudy(): Promise<{ available: boolean; study?: EfficiencyStudy }> {
  const res = await fetch(`${BASE}/lab/efficiency`);
  if (!res.ok) throw new Error(`Lab fetch failed: ${res.status}`);
  return res.json();
}

export function streamResearch(
  platform: string,
  id: string,
  onToken: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void
): () => void {
  const url = `${BASE}/markets/${encodeURIComponent(id)}/research?platform=${platform}`;
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        try {
          const json = JSON.parse(body);
          onError(json.error || `HTTP ${res.status}`);
        } catch {
          onError(`HTTP ${res.status}`);
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { onError('No response body'); return; }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') { onDone(); return; }
          if (data.startsWith('[ERROR]')) { onError(data.slice(8)); return; }
          onToken(data);
        }
      }

      onDone();
    } catch (err) {
      if (!controller.signal.aborted) {
        onError(err instanceof Error ? err.message : 'Connection failed');
      }
    }
  })();

  return () => controller.abort();
}
