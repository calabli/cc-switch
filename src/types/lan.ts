// 局域网用量聚合相关类型

/** 一台设备在局域网里的身份 */
export interface LanDeviceInfo {
  deviceId: string;
  deviceName: string;
  appVersion: string;
  platform: string;
  startedAt: number;
}

/** 扫描局域网发现的对端 */
export interface LanDiscoveredDevice {
  deviceId: string;
  deviceName: string;
  appVersion: string;
  host: string;
  port: number;
}

/** 已登记设备的连接状态 */
export interface LanDeviceStatus {
  deviceId: string;
  deviceName: string;
  host: string;
  port: number;
  registered: boolean;
  enabled: boolean;
  lastSeenAt?: number;
  lastSyncAt?: number;
  lastError?: string;
  /** 最近一次同步拉回多少条 */
  lastImported: number;
}

/** 用量汇总块，字段和 UsageSummary 对齐 */
export interface LanUsageSummary {
  totalRequests: number;
  totalCost: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  successCount: number;
  successRate: number;
  realTotalTokens: number;
  cacheHitRate: number;
}

/** 单台设备在汇总里的一行 */
export interface LanDeviceUsage {
  deviceId: string;
  deviceName: string;
  isLocal: boolean;
  summary: LanUsageSummary;
}

/** 局域网总览：本机 + 远端 + 合计 */
export interface LanUsageOverview {
  local: LanUsageSummary;
  remote: LanUsageSummary;
  combined: LanUsageSummary;
  devices: LanDeviceUsage[];
}

/** 按天的跨设备合计 */
export interface LanDailyTotal {
  date: string;
  summary: LanUsageSummary;
}

/** 局域网共享设置 */
export interface LanShareSettings {
  enabled: boolean;
  port: number;
  deviceName: string;
  autoSync: boolean;
  autoSyncIntervalSecs: number;
}

/** 一次同步的结果 */
export interface LanSyncResult {
  deviceId: string;
  deviceName: string;
  imported: number;
  error?: string;
}
