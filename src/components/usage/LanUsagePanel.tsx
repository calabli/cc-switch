import { useCallback, useEffect, useState } from "react";
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
import { APP_DISPLAY_NAME } from "@/components/shell/AppGlyph";
import { LAN_SHARED_APPS } from "@/types/lan";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { lanUsageApi } from "@/lib/api/lan";
import { useMoneyFormat } from "@/hooks/useMoneyFormat";
import { fmtInt, getLocaleFromLanguage } from "./format";
import { lanKeys, useLanOverview } from "@/lib/query/lan";
import type { UsageRangeSelection } from "@/types/usage";
import type {
  LanSharedAppType,
  LanDeviceStatus,
  LanDiscoveredDevice,
  LanUsageSummary,
} from "@/types/lan";

interface LanUsagePanelProps {
  range: UsageRangeSelection;
  defaultExpanded?: boolean;
  showOverview?: boolean;
}

/** 局域网用量聚合面板。按勾选应用共享本机统计数据，不转发远端副本。 */
export function LanUsagePanel({
  range,
  defaultExpanded = false,
  showOverview = true,
}: LanUsagePanelProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const locale = getLocaleFromLanguage(
    i18n.resolvedLanguage || i18n.language || "en",
  );

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingShare, setSavingShare] = useState(false);
  const [discovered, setDiscovered] = useState<LanDiscoveredDevice[]>([]);
  const [manualHost, setManualHost] = useState("");
  const [connecting, setConnecting] = useState(false);

  const settingsQuery = useQuery({
    queryKey: lanKeys.settings,
    queryFn: () => lanUsageApi.getSettings(),
  });
  const devicesQuery = useQuery({
    queryKey: lanKeys.devices,
    queryFn: () => lanUsageApi.listDevices(),
  });
  const overviewQuery = useLanOverview(range, { enabled: showOverview });

  const shareEnabled = settingsQuery.data?.enabled ?? false;

  useEffect(() => {
    if (!expanded) return;
    void queryClient.invalidateQueries({ queryKey: lanKeys.all });
  }, [expanded, queryClient]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: lanKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["usage", "multi-device"] }),
    ]);
  }, [queryClient]);

  const toggleShare = async (enabled: boolean) => {
    if (!settingsQuery.data) return;
    setSavingShare(true);
    try {
      const saved = await lanUsageApi.saveSettings({
        ...settingsQuery.data,
        enabled,
      });
      queryClient.setQueryData(lanKeys.settings, saved);
      refreshAll();
      toast.success(
        enabled ? t("usage.lan.shareEnabled") : t("usage.lan.shareDisabled"),
      );
    } catch (error) {
      toast.error(t("usage.lan.shareFailed", { error: String(error) }));
    } finally {
      setSavingShare(false);
    }
  };

  const toggleSource = async (app: LanSharedAppType, checked: boolean) => {
    if (!settingsQuery.data || savingShare) return;
    const selected = settingsQuery.data.sharedAppTypes;
    const sharedAppTypes = checked
      ? [...selected, app]
      : selected.filter((source) => source !== app);
    setSavingShare(true);
    try {
      const saved = await lanUsageApi.saveSettings({
        ...settingsQuery.data,
        sharedAppTypes,
      });
      queryClient.setQueryData(lanKeys.settings, saved);
      refreshAll();
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

  const connectByHost = async () => {
    const host = manualHost.trim();
    if (!host) return;
    setConnecting(true);
    try {
      await lanUsageApi.connectByHost(host);
      setManualHost("");
      await refreshAll();
      toast.success(t("usage.lan.connected", { name: host }));
    } catch (error) {
      toast.error(t("usage.lan.connectFailed", { error: String(error) }));
    } finally {
      setConnecting(false);
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
          t("usage.lan.syncPartial", {
            count: imported,
            failed: failed.length,
          }),
        );
      }
    } catch (error) {
      toast.error(t("usage.lan.syncFailed", { error: String(error) }));
    } finally {
      setSyncing(false);
    }
  };

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
          {showOverview && overview && overview.combined.totalRequests > 0 && (
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
          <fieldset
            className="m-0 flex flex-col gap-2 border-0 p-0"
            disabled={savingShare || !settingsQuery.data}
          >
            <legend className="mb-2 text-body text-fg-1">
              {t("usage.lan.sourcesLabel")}
            </legend>
            <div className="flex flex-wrap gap-4">
              {LAN_SHARED_APPS.map((app) => (
                <label
                  key={app}
                  className="flex items-center gap-2 text-body text-fg-1"
                >
                  <Checkbox
                    checked={
                      settingsQuery.data?.sharedAppTypes?.includes(app) ?? false
                    }
                    onCheckedChange={(checked) =>
                      void toggleSource(app, checked)
                    }
                  />
                  {APP_DISPLAY_NAME[app]}
                </label>
              ))}
            </div>
            <p className="m-0 text-caption text-fg-3">
              {t("usage.lan.sourcesHint")}
            </p>
          </fieldset>
          {/* 合计：本机 + 各远端设备 */}
          {showOverview && (
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
          )}

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
            <Input
              className="h-7 w-[180px] text-body"
              placeholder={t("usage.lan.manualPlaceholder")}
              value={manualHost}
              onChange={(e) => setManualHost(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void connectByHost();
              }}
              aria-label={t("usage.lan.manualPlaceholder")}
            />
            <Button
              type="button"
              variant="neutral"
              size="compact"
              disabled={connecting || manualHost.trim().length === 0}
              onClick={() => void connectByHost()}
            >
              {connecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="h-3.5 w-3.5" />
              )}
              {t("usage.lan.manualConnect")}
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
                          {device.host}:{device.port}
                          {showOverview && (
                            <>
                              {" "}
                              ·{" "}
                              {usage
                                ? t("usage.lan.deviceUsage", {
                                    tokens: fmtInt(
                                      usage.summary.realTotalTokens,
                                      locale,
                                    ),
                                    cost: money(usage.summary.totalCost, 2),
                                  })
                                : t("usage.lan.deviceNoUsage")}
                            </>
                          )}
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
