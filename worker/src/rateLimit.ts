import {
  HeliconeProperties,
  HeliconeProxyRequest,
} from "./lib/HeliconeProxyRequest/mapper";

export interface RateLimitOptions {
  time_window: number;
  segment: string | undefined;
  quota: number;
  unit: "token" | "request" | "dollar";
}

export interface RateLimitResponse {
  status: "ok" | "rate_limited";
  limit: number;
  remaining: number;
  reset?: number;
}

function parsePolicy(input: string): RateLimitOptions {
  const regex = /^(\d+);w=(\d+)(?:;u=(request|token|dollar))?(?:;s=([\w-]+))?$/;

  const match = input.match(regex);
  if (!match) {
    throw new Error("Invalid rate limit string format");
  }

  const quota = parseInt(match[1], 10);
  const time_window = parseInt(match[2], 10);
  const unit = match[3] as "request" | "token" | "dollar" | undefined;
  const segment = match[4];

  return {
    quota,
    time_window,
    unit: unit || "request",
    segment,
  };
}

async function getSegmentKeyValue(
  properties: HeliconeProperties,
  userId: string | undefined,
  segment: string | undefined
): Promise<string> {
  if (segment === undefined) {
    return "global";
  } else if (segment === "user") {
    if (userId === undefined) {
      throw new Error("Missing user ID");
    }
    return `user=${userId}`;
  } else {
    const headerValue = properties[segment.toLowerCase()];
    if (headerValue === undefined) {
      throw new Error(`Missing "${segment}" header`);
    }
    return `${segment.toLowerCase()}=${headerValue}`;
  }
}

function binarySearchFirstRelevantIndex(
  timestamps: number[],
  now: number,
  timeWindowMillis: number
): number {
  let left = 0;
  let right = timestamps.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (now - timestamps[mid] < timeWindowMillis) {
      result = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return result;
}

interface RateLimitProps {
  heliconeProperties: HeliconeProperties;
  userId: string | undefined;
  rateLimitOptions: RateLimitOptions;
  identifierKey: string | undefined;
  rateLimitKV: KVNamespace;
}

export async function checkRateLimit(
  props: RateLimitProps
): Promise<RateLimitResponse> {
  const {
    heliconeProperties,
    userId,
    rateLimitOptions,
    identifierKey,
    rateLimitKV,
  } = props;
  const { time_window, segment, quota } = rateLimitOptions;

  const segmentKeyValue = await getSegmentKeyValue(
    heliconeProperties,
    userId,
    segment
  );
  const kvKey = `rl_${segmentKeyValue}_${identifierKey}`;
  const kv = await rateLimitKV.get(kvKey, "text");
  const timestamps = kv !== null ? JSON.parse(kv) : [];

  const now = Date.now();
  const timeWindowMillis = time_window * 1000; // Convert time_window to milliseconds

  const firstRelevantIndex = binarySearchFirstRelevantIndex(
    timestamps,
    now,
    timeWindowMillis
  );
  const relevantTimestampsCount = timestamps.length - firstRelevantIndex;

  const remaining = Math.max(0, quota - relevantTimestampsCount);
  const reset = Math.ceil(
    (timestamps[firstRelevantIndex] + timeWindowMillis - now) / 1000
  );

  if (timestamps.length < quota) {
    return { status: "ok", limit: quota, remaining };
  }

  // Check if the first timestamp is within the time window when the length is exactly equal to the quota
  if (timestamps.length === quota) {
    if (now - timestamps[0] >= timeWindowMillis) {
      return { status: "ok", limit: quota, remaining };
    } else {
      return { status: "rate_limited", limit: quota, remaining, reset };
    }
  }

  if (relevantTimestampsCount >= quota) {
    return { status: "rate_limited", limit: quota, remaining, reset };
  }

  return { status: "ok", limit: quota, remaining };
}

export async function updateRateLimitCounter(
  props: RateLimitProps
): Promise<void> {
  const {
    heliconeProperties,
    userId,
    rateLimitOptions,
    identifierKey: heliconeAuthHash,
    rateLimitKV,
  } = props;
  const { time_window, segment } = rateLimitOptions;

  const segmentKeyValue = await getSegmentKeyValue(
    heliconeProperties,
    userId,
    segment
  );

  const kvKey = `rl_${segmentKeyValue}_${heliconeAuthHash}`;
  const kv = await rateLimitKV.get(kvKey, "text");
  const timestamps = kv !== null ? JSON.parse(kv) : [];

  const now = Date.now();
  const timeWindowMillis = time_window * 1000; // Convert time_window to milliseconds
  const prunedTimestamps = timestamps.filter((timestamp: number) => {
    return now - timestamp < timeWindowMillis;
  });

  prunedTimestamps.push(now);

  await rateLimitKV.put(kvKey, JSON.stringify(prunedTimestamps), {
    expirationTtl: Math.ceil(timeWindowMillis / 1000), // Convert timeWindowMillis to seconds for expirationTtl
  });
}
