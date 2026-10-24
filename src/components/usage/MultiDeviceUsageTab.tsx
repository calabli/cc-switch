import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Monitor, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanOverview, useLanDailyTotals } from "@/lib/query/lan";
import { useMoneyFormat } from "@/hooks/useMoneyFormat";
import type { UsageRangeSelection } from "@/types/usage";
import { UsageHeroView } from "./UsageHero";
import { UsageTrendChartView } from "./UsageTrendChart";
import { UsageHeatmapView } from "./UsageHeatmap";
import { LanUsagePanel } from "./LanUsagePanel";
import { TablePagination, useClientPagination } from "./TablePagination";
import { usageTable } from "./usageTable";
import { fmtInt, formatHitRatePercent, getLocaleFromLanguage } from "./format";
import type { UsageMetric } from "./rememberedChoice";

interface MultiDeviceUsageTabProps {
  range: UsageRangeSelection;
  metric: UsageMetric;
  onMetricChange: (metric: UsageMetric) => void;
  compact?: boolean;
}

/** Reuses the local dashboard's visual components with actual LAN statistics. */
export function MultiDeviceUsageTab({
  range,
  metric,
  onMetricChange,
  compact,
}: MultiDeviceUsageTabProps) {
  const { t, i18n } = useTranslation();
  const { money } = useMoneyFormat();
  const locale = getLocaleFromLanguage(
    i18n.resolvedLanguage || i18n.language || "en",
  );
  const [manageOpen, setManageOpen] = useState(false);
  const overview = useLanOverview(range);
  const daily = useLanDailyTotals(range);
  const summaries = useMemo(
    () =>
      overview.data
        ? [
            {
              appType: "multi-device",
              summary: {
                ...overview.data.combined,
                successRate: overview.data.combined.successRate * 100,
              },
            },
          ]
        : [],
    [overview.data],
  );
  const trends = useMemo(
    () =>
      daily.data?.map(({ date, summary }) => ({
        date,
        requestCount: summary.totalRequests,
        totalCost: summary.totalCost,
        totalTokens: summary.realTotalTokens,
        totalInputTokens: summary.totalInputTokens,
        totalOutputTokens: summary.totalOutputTokens,
        totalCacheReadTokens: summary.totalCacheReadTokens,
        totalCacheCreationTokens: summary.totalCacheCreationTokens,
      })),
    [daily.data],
  );
  const devices = useMemo(
    () =>
      [...(overview.data?.devices ?? [])].sort(
        (a, b) =>
          Number(b.isLocal) - Number(a.isLocal) ||
          b.summary.realTotalTokens - a.summary.realTotalTokens,
      ),
    [overview.data],
  );
  const pagination = useClientPagination(devices, JSON.stringify(range));

  return (
    <>
      {(overview.isError || daily.isError) && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-panel border border-border bg-surface px-4 py-3 text-body text-fg-2"
        >
          {t("usage.lan.loadFailed")}
          <Button
            variant="neutral"
            size="compact"
            onClick={() => {
              void overview.refetch();
              void daily.refetch();
            }}
          >
            {t("usage.lan.retry")}
          </Button>
        </div>
      )}
      <section
        aria-label={t("usage.lan.combined")}
        className="shrink-0 overflow-hidden rounded-panel border border-border bg-surface"
      >
        <UsageHeroView
          range={range}
          metric={metric}
          onMetricChange={onMetricChange}
          refreshIntervalMs={0}
          compact={compact}
          summaries={summaries}
          isLoading={overview.isLoading}
        />
        {range.preset === "all" ? (
          <UsageHeatmapView
            metric={metric}
            refreshIntervalMs={0}
            trends={trends}
            isLoading={daily.isLoading}
          />
        ) : (
          <UsageTrendChartView
            range={range}
            metric={metric}
            refreshIntervalMs={0}
            trends={trends}
            isLoading={daily.isLoading}
            dailyOnly
          />
        )}
        <p className="m-0 px-4 pb-3 text-caption text-fg-3">
          {t("usage.lan.trendScopeHint")}
        </p>
      </section>
      <section className="shrink-0 overflow-hidden rounded-panel border border-border bg-surface">
        <div className="flex h-11 items-center justify-between gap-3 border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-2 text-body font-medium text-fg-1">
            <Monitor className="h-3.5 w-3.5 shrink-0 text-fg-3" />
            {t("usage.lan.deviceUsageTitle")}
            <span className="rounded-[4px] bg-subtle px-1.5 text-caption tabular-nums text-fg-3">
              {devices.length}
            </span>
          </div>
          <Button
            variant="quiet"
            size="compact"
            aria-expanded={manageOpen}
            aria-controls="usage-lan-management"
            onClick={() => setManageOpen((value) => !value)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t("usage.lan.manageDevices")}
          </Button>
        </div>
        {overview.isLoading ? (
          <div className={usageTable.skeleton} />
        ) : (
          <div className={usageTable.scroller}>
            <table
              className={usageTable.table}
              aria-label={t("usage.lan.deviceUsageTitle")}
            >
              <thead>
                <tr className={usageTable.headRow}>
                  {[
                    "deviceName",
                    "scope",
                    "requests",
                    "cost",
                    "tokens",
                    "cacheHitRate",
                  ].map((key) => (
                    <th key={key} className={usageTable.th}>
                      {t(
                        ["requests", "cost", "tokens", "cacheHitRate"].includes(
                          key,
                        )
                          ? `usage.${key}`
                          : `usage.lan.${key}`,
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagination.pageRows.map((device) => (
                  <tr key={device.deviceId} className={usageTable.row}>
                    <td className={usageTable.td}>{device.deviceName}</td>
                    <td className={usageTable.td}>
                      <span className="text-caption text-fg-3">
                        {t(
                          device.isLocal
                            ? "usage.lan.local"
                            : "usage.lan.remote",
                        )}
                      </span>
                    </td>
                    <td className={usageTable.td}>
                      {fmtInt(device.summary.totalRequests, locale)}
                    </td>
                    <td className={usageTable.td}>
                      {money(device.summary.totalCost, 4)}
                    </td>
                    <td className={usageTable.td}>
                      {fmtInt(device.summary.realTotalTokens, locale)}
                    </td>
                    <td className={usageTable.td}>
                      {device.summary.realTotalTokens > 0
                        ? formatHitRatePercent(device.summary.cacheHitRate)
                        : "—"}
                    </td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={6} className={usageTable.empty}>
                      {t("usage.lan.setupHint")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={pagination.setPage}
        />
      </section>
      {manageOpen && (
        <div id="usage-lan-management">
          <LanUsagePanel range={range} defaultExpanded showOverview={false} />
        </div>
      )}
    </>
  );
}
