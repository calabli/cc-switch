import { invoke } from "@tauri-apps/api/core";
import type {
  LanDeviceInfo,
  LanDeviceStatus,
  LanDiscoveredDevice,
  LanDailyTotal,
  LanShareSettings,
  LanSyncResult,
  LanUsageOverview,
} from "@/types/lan";

export const lanUsageApi = {
  /** 读取共享设置 */
  getSettings: async (): Promise<LanShareSettings> =>
    invoke("get_lan_share_settings"),

  /** 保存共享设置，并按新设置启停服务 */
  saveSettings: async (settings: LanShareSettings): Promise<LanShareSettings> =>
    invoke("save_lan_share_settings", { settings }),

  /** 本机在局域网里的身份 */
  getDeviceInfo: async (): Promise<LanDeviceInfo> =>
    invoke("get_lan_device_info"),

  /** 扫描局域网 */
  discover: async (timeoutMs?: number): Promise<LanDiscoveredDevice[]> =>
    invoke("discover_lan_devices", { timeoutMs }),

  /** 已登记的设备 */
  listDevices: async (): Promise<LanDeviceStatus[]> =>
    invoke("list_lan_devices"),

  /** 连接一台设备（登记后立刻同步一次） */
  connect: async (
    deviceId: string,
    deviceName: string,
    host: string,
    port?: number,
  ): Promise<LanDeviceStatus> =>
    invoke("connect_lan_device", { deviceId, deviceName, host, port }),

  /** 手动按地址连接（广播被挡时用） */
  connectByHost: async (
    host: string,
    port?: number,
  ): Promise<LanDeviceStatus> =>
    invoke("connect_lan_device_by_host", { host, port }),

  /** 断开一台设备 */
  disconnect: async (deviceId: string): Promise<void> =>
    invoke("disconnect_lan_device", { deviceId }),

  /** 启用/停用一台设备 */
  setEnabled: async (deviceId: string, enabled: boolean): Promise<void> =>
    invoke("set_lan_device_enabled", { deviceId, enabled }),

  /** 手动触发一次全量同步 */
  syncAll: async (): Promise<LanSyncResult[]> => invoke("sync_lan_devices"),

  /** 局域网用量总览 */
  getOverview: async (
    startDate?: number,
    endDate?: number,
  ): Promise<LanUsageOverview> =>
    invoke("get_lan_usage_overview", { startDate, endDate }),

  /** 按天的跨设备合计 */
  getDailyTotals: async (
    startDate?: number,
    endDate?: number,
  ): Promise<LanDailyTotal[]> =>
    invoke("get_lan_daily_totals", { startDate, endDate }),
};
