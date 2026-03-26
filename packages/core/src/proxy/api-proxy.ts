interface RequestParams {
  baseUrl: string;
  endpoint: string;
  params: Record<string, string>;
  apiKey: string;
  rateLimits?: { per_second: number; daily: number };
  timeoutMs?: number;
  retries?: number;
}

interface UsageInfo {
  totalRequests: number;
  requestsLastSecond: number;
  requestsToday: number;
}

interface RateTracker {
  timestamps: number[];
  dailyCount: number;
  dailyResetAt: number;
}

export class ApiProxy {
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private rateLimiters: Map<string, RateTracker> = new Map();
  private usageCounters: Map<string, number> = new Map();

  private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async request(params: RequestParams): Promise<any> {
    // Check cache
    const cacheKey = this.buildCacheKey(params);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // Check rate limits
    if (params.rateLimits) {
      this.enforceRateLimit(params.baseUrl, params.rateLimits);
    }

    // Build URL
    const url = new URL(params.endpoint, params.baseUrl);
    for (const [key, value] of Object.entries(params.params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('apikey', params.apiKey);

    // Make request with retry and timeout support
    const maxAttempts = (params.retries ?? 0) + 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const fetchPromise = fetch(url.toString());
        let response: Response;
        if (params.timeoutMs) {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Request timed out after ${params.timeoutMs}ms`)), params.timeoutMs);
          });
          response = await Promise.race([fetchPromise, timeoutPromise]);
        } else {
          response = await fetchPromise;
        }
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Cache result
        this.cache.set(cacheKey, { data, expiry: Date.now() + ApiProxy.CACHE_TTL });

        // Track usage
        this.trackUsage(params.baseUrl);

        return data;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        }
      }
    }

    throw lastError!;
  }

  getUsage(baseUrl: string): UsageInfo {
    const tracker = this.rateLimiters.get(baseUrl);
    const total = this.usageCounters.get(baseUrl) || 0;
    const now = Date.now();

    return {
      totalRequests: total,
      requestsLastSecond: tracker
        ? tracker.timestamps.filter((t) => now - t < 1000).length
        : 0,
      requestsToday: tracker?.dailyCount || 0,
    };
  }

  private buildCacheKey(params: RequestParams): string {
    return `${params.baseUrl}${params.endpoint}?${JSON.stringify(params.params)}`;
  }

  private enforceRateLimit(
    baseUrl: string,
    limits: { per_second: number; daily: number },
  ): void {
    const now = Date.now();
    let tracker = this.rateLimiters.get(baseUrl);

    if (!tracker) {
      tracker = { timestamps: [], dailyCount: 0, dailyResetAt: now + 86400000 };
      this.rateLimiters.set(baseUrl, tracker);
    }

    // Reset daily counter
    if (now > tracker.dailyResetAt) {
      tracker.dailyCount = 0;
      tracker.dailyResetAt = now + 86400000;
    }

    // Clean old timestamps (older than 1 second)
    tracker.timestamps = tracker.timestamps.filter((t) => now - t < 1000);

    // Check per-second
    if (tracker.timestamps.length >= limits.per_second) {
      throw new Error(
        `Rate limit exceeded: ${limits.per_second} requests per second for ${baseUrl}`,
      );
    }

    // Check daily
    if (tracker.dailyCount >= limits.daily) {
      throw new Error(
        `Rate limit exceeded: ${limits.daily} requests per day for ${baseUrl}`,
      );
    }

    tracker.timestamps.push(now);
    tracker.dailyCount++;
  }

  private trackUsage(baseUrl: string): void {
    const current = this.usageCounters.get(baseUrl) || 0;
    this.usageCounters.set(baseUrl, current + 1);
  }
}
