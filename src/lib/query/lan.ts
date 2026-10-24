import { useQuery } from "@tanstack/react-query";
import { lanUsageApi } from "@/lib/api/lan";
import { resolveUsageRange } from "@/lib/usageRange";
import type { UsageRangeSelection } from "@/types/usage";

export const lanKeys = {
  all: ["lan-usage"] as const,
  settings: ["lan-usage", "settings"] as const,
  devices: ["lan-usage", "devices"] as const,
  overview: (range: UsageRangeSelection) =>
    ["lan-usage", "overview", range] as const,
  daily: (range: UsageRangeSelection) => ["lan-usage", "daily", range] as const,
};

/** Stable selection keys, with moving endpoints resolved at fetch time like local usage. */
export function useLanOverview(range: UsageRangeSelection) {
  return useQuery({
    queryKey: lanKeys.overview(range),
    queryFn: () => {
      const { startDate, endDate } = resolveUsageRange(range);
      return lanUsageApi.getOverview(startDate, endDate);
    },
    refetchInterval: false,
  });
}

export function useLanDailyTotals(range: UsageRangeSelection) {
  return useQuery({
    queryKey: lanKeys.daily(range),
    queryFn: () => {
      const { startDate, endDate } = resolveUsageRange(range);
      return lanUsageApi.getDailyTotals(startDate, endDate);
    },
    refetchInterval: false,
  });
}
