import { createContext, useContext } from "react";
import type { QueryKey } from "@tanstack/react-query";
import { usageApi } from "@/lib/api/usage";
import type { LogFilters } from "@/types/usage";

const ScopeContext = createContext(false);
export const UsageDataScopeProvider = ScopeContext.Provider;
const multiDeviceApi = {
  ...usageApi,
  getUsageSummary: (
    start?: number,
    end?: number,
    app?: string,
    provider?: string,
    model?: string,
  ) => usageApi.getUsageSummary(start, end, app, provider, model, true),
  getUsageSummaryByApp: (
    start?: number,
    end?: number,
    provider?: string,
    model?: string,
  ) => usageApi.getUsageSummaryByApp(start, end, provider, model, true),
  getUsageTrends: (
    start?: number,
    end?: number,
    app?: string,
    provider?: string,
    model?: string,
  ) => usageApi.getUsageTrends(start, end, app, provider, model, true),
  getUsageFirstDate: (app?: string, provider?: string, model?: string) =>
    usageApi.getUsageFirstDate(app, provider, model, true),
  getProviderStats: (
    start?: number,
    end?: number,
    app?: string,
    provider?: string,
    model?: string,
  ) => usageApi.getProviderStats(start, end, app, provider, model, true),
  getModelStats: (
    start?: number,
    end?: number,
    app?: string,
    provider?: string,
    model?: string,
  ) => usageApi.getModelStats(start, end, app, provider, model, true),
  getRequestLogs: (filters: LogFilters, page?: number, size?: number) =>
    usageApi.getRequestLogs(filters, page, size, true),
  getRequestDetail: (requestId: string) =>
    usageApi.getRequestDetail(requestId, true),
};

export function sameUsageScope(
  key: QueryKey | undefined,
  multiDevice: boolean,
) {
  return (key?.[1] === "multi-device") === multiDevice;
}

export function useUsageDataScope() {
  const multiDevice = useContext(ScopeContext);
  return {
    multiDevice,
    api: multiDevice ? multiDeviceApi : usageApi,
    scopeKey: (key: QueryKey): QueryKey =>
      multiDevice ? [key[0], "multi-device", ...key.slice(1)] : key,
  };
}
