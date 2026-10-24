import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Monitor,
  Plug,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { lanUsageApi } from "@/lib/api/lan";
import { useMoneyFormat } from "@/hooks/useMoneyFormat";
import { fmtInt, getLocaleFromLanguage } from "./format";
import { resolveUsageRange } from "@/lib/usageRange";
import type { UsageRangeSelection } from "@/types/usage";
import type {
  LanDeviceStatus,
  LanDiscoveredDevice,
  LanUsageSummary,
} from "@/types/lan";

const lanKeys = {
  all: ["lan-usage"] as const,
  settings: ["lan-usage", "settings"] as const,
  devices: ["lan-usage", "devices"] as const,
  overview: (start: number | undefined, end: number | undefined) =>
    ["lan-usage", "overview", start ?? 0, end ?? 0] as const,
};

interface LanUsagePanelProps {
  range: UsageRangeSelection;
}

/**
 * 局域网用量聚合面板。
 *
 * 只聚合「从本地文件解析出来的用量」（DSH / ZCode 这类会话导入）。
 * 每台设备各自跑一个只读的小服务，把这部分用量共享出来；本机点一下就能看到
 * 同一网段所有设备加起来的数据。
 */
export function LanUsagePanel({ range }: LanUsagePanelProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const locale = getLocaleFromLanguage(
    i18n.resolvedLanguage || i18n.language || "en",
  );

  const [expanded, setExpanded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingShare, setSavingShare] = useState(false);
  const [discovered, setDiscovered] = useState<LanDiscoveredDevice[]>([]);

  const resolved = useMemo(() => resolveUsageRange(range), [range]);
  const startDate = resolved.startDate;
  const endDate = resolved.endDate;

  const settingsQuery = useQuery({
    queryKey: lanKeys.settings,
    queryFn: () => lanUsageApi.getSettings(),
  });
  const devicesQuery = useQuery({
    queryKey: lanKeys.devices,
    queryFn: () => lanUsageApi.listDevices(),
  });
  const overviewQuery = useQuery({
    queryKey: lanKeys.overview(startDate, endDate),
    queryFn: () => lanUsageApi.getOverview(startDate, endDate),
  });

  const shareEnabled = settingsQuery.data?.enabled ?? false;

  // 没开共享、也没有连过设备时不占版面：用量页本来就不是干这个的。
  const hasContent = shareEnabled || (devicesQuery.data?.length ?? 0) > 0;

  useEffect(() => {
    if (!expanded) return;
    void queryClient.invalidateQueries({ queryKey: lanKeys.all });
  }, [expanded, queryClient]);

  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: lanKeys.all });
  }, [queryClient]);

  const toggleShare = async (enabled: boolean) => {
    if (!settingsQuery.data) return;
    setSavingShare(true);
    try {
      await lanUsageApi.saveSettings({ ...settingsQuery.data, enabled });
      await refreshAll();
      toast.success(
        enabled ? t("usage.lan.shareEnabled") : t("usage.lan.shareDisabled"),
      );
    } catch (error) {
      toast.error(t("usage.lan.shareFailed", { error: String(error) }));
    } finally {
      setSavingShare(false);
    }
  };

  const scan = async () => {
    setScanning(true);
    try {
      const found = await lanUsageApi.discover(1500);
      setDiscovered(found);
      if (found.length === 0) toast.info(t("usage.lan.scanEmpty"));
    } catch (error) {
      toast.error(t("usage.lan.scanFailed", { error: String(error) }));
    } finally {
      setScanning(false);
    }
  };

  const connect = async (device: LanDiscoveredDevice) => {
    try {
      await lanUsageApi.connect(
        device.deviceId,
        device.deviceName,
        device.host,
        device.port,
      );
      await refreshAll();
      toast.success(t("usage.lan.connected", { name: device.deviceName }));
    } catch (error) {
      toast.error(t("usage.lan.connectFailed", { error: String(error) }));
    }
  };

  const disconnect = async (device: LanDeviceStatus) => {
    try {
      await lanUsageApi.disconnect(device.deviceId);
      await refreshAll();
      toast.success(t("usage.lan.disconnected", { name: device.deviceName }));
    } catch (error) {
      toast.error(t("usage.lan.disconnectFailed", { error: String(error) }));
    }
  };

  const toggleDevice = async (device: LanDeviceStatus, enabled: boolean) => {
    try {
      await lanUsageApi.setEnabled(device.deviceId, enabled);
      await refreshAll();
    } catch (error) {
      toast.error(t("usage.lan.toggleFailed", { error: String(error) }));
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const results = await lanUsageApi.syncAll();
      const imported = results.reduce((sum, r) => sum + r.imported, 0);
      const failed = results.filter((r) => r.error);
      await refreshAll();
      if (failed.length === 0) {
        toast.success(t("usage.lan.syncDone", { count: imported }));
      } else {
        toast.warning(
          t("usage.lan.syncPartial", { count: imported, failed: failed.length }),
        );
      }
    } catch (error) {
      toast.error(t("usage.lan.syncFailed", { error: String(error) }));
    } finally {
      setSyncing(false);
    }
  };

  if (!hasContent) return null;

  const overview = overviewQuery.data;

  return (
    <section className="shrink-0 overflow-hidden rounded-panel border border-border bg-surface">
      <div className="flex h-11 items-center gap-2 px-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-3" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-3" />
          )}
          <Monitor className="h-3.5 w-3.5 shrink-0 text-fg-3" />
          <span className="truncate text-section text-fg-1">
            {t("usage.lan.title")}
          </span>
          {overview && overview.combined.totalRequests > 0 && (
            <span className="truncate text-caption text-fg-3">
              {t("usage.lan.combinedSummary", {
                tokens: fmtInt(overview.combined.realTotalTokens, locale),
                requests: fmtInt(overview.combined.totalRequests, locale),
              })}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-caption text-fg-2">
            {t("usage.lan.shareLabel")}
          </span>
          <Switch
            checked={shareEnabled}
            disabled={savingShare || settingsQuery.isLoading}
            onCheckedChange={(checked) => void toggleShare(checked)}
            aria-label={t("usage.lan.shareLabel")}
          />
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-3">
          {/* 合计：本机 + 各远端设备 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryTile
              label={t("usage.lan.local")}
              summary={overview?.local}
              locale={locale}
              detail={t("usage.lan.tileDetail", {
                requests: fmtInt(overview?.local.totalRequests ?? 0, locale),
                cost: money(overview?.local.totalCost, 2),
              })}
            />
            <SummaryTile
              label={t("usage.lan.remote")}
              summary={overview?.remote}
              locale={locale}
              detail={t("usage.lan.tileDetail", {
                requests: fmtInt(overview?.remote.totalRequests ?? 0, locale),
                cost: money(overview?.remote.totalCost, 2),
              })}
            />
            <SummaryTile
              label={t("usage.lan.combined")}
              summary={overview?.combined}
              locale={locale}
              emphasis
              detail={t("usage.lan.tileDetail", {
                requests: fmtInt(
                  overview?.combined.totalRequests ?? 0,
                  locale,
                ),
                cost: money(overview?.combined.totalCost, 2),
              })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="neutral"
              size="compact"
              disabled={scanning}
              onClick={() => void scan()}
            >
              {scanning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              {t("usage.lan.scan")}
            </Button>
            <Button
              type="button"
              variant="neutral"
              size="compact"
              disabled={syncing}
              onClick={() => void syncNow()}
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {t("usage.lan.syncNow")}
            </Button>
            <span className="text-caption text-fg-3">
              {t("usage.lan.shareHint")}
            </span>
          </div>

          {/* 扫描到的设备 */}
          {discovered.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-body text-fg-1">
                {t("usage.lan.discoveredTitle")}
              </h3>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {discovered.map((device) => (
                  <li
                    key={device.deviceId}
                    className="flex items-center gap-3 rounded-control border border-border px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body text-fg-1">
                        {device.deviceName}
                      </span>
                      <span className="truncate text-caption text-fg-3">
                        {device.host}:{device.port} · v{device.appVersion}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="neutral"
                      size="compact"
                      onClick={() => void connect(device)}
                    >
                      <Plug className="h-3.5 w-3.5" />
                      {t("usage.lan.connect")}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 已连接的设备 */}
          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-body text-fg-1">
              {t("usage.lan.connectedTitle")}
            </h3>
            {(devicesQuery.data?.length ?? 0) === 0 ? (
              <p className="m-0 text-caption text-fg-3">
                {t("usage.lan.noDevices")}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {devicesQuery.data?.map((device) => {
                  const usage = overview?.devices.find(
                    (d) => d.deviceId === device.deviceId,
                  );
                  return (
                    <li
                      key={device.deviceId}
                      className="flex items-center gap-3 rounded-control border border-border px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body text-fg-1">
                          {device.deviceName}
                        </span>
                        <span className="truncate text-caption text-fg-3">
                          {device.host}:{device.port} ·{" "}
                          {usage
                            ? t("usage.lan.deviceUsage", {
                                tokens: fmtInt(
                                  usage.summary.realTotalTokens,
                                  locale,
                                ),
                                cost: money(usage.summary.totalCost, 2),
                              })
                            : t("usage.lan.deviceNoUsage")}
                        </span>
                        {device.lastError && (
                          <span className="truncate text-caption text-danger">
                            {device.lastError}
                          </span>
                        )}
                      </div>
                      <Switch
                        size="sm"
                        checked={device.enabled}
                        onCheckedChange={(checked) =>
                          void toggleDevice(device, checked)
                        }
                        aria-label={t("usage.lan.enableDevice")}
                      />
                      <Button
                        type="button"
                        variant="quiet"
                        size="icon-compact"
                        aria-label={t("usage.lan.disconnect")}
                        onClick={() => void disconnect(device)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface SummaryTileProps {
  label: string;
  summary?: LanUsageSummary;
  locale: string;
  detail: string;
  emphasis?: boolean;
}

function SummaryTile({
  label,
  summary,
  locale,
  detail,
  emphasis,
}: SummaryTileProps) {
  return (
    <div
      className={
        emphasis
          ? "flex flex-col gap-1 rounded-control border border-border-strong bg-subtle px-3 py-2"
          : "flex flex-col gap-1 rounded-control border border-border px-3 py-2"
      }
    >
      <span className="text-caption text-fg-3">{label}</span>
      <span className="text-section tabular-nums text-fg-1">
        {summary ? fmtInt(summary.realTotalTokens, locale) : "--"}
      </span>
      <span className="text-caption tabular-nums text-fg-2">{detail}</span>
    </div>
  );
}
