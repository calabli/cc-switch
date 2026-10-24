//! 局域网用量聚合的 Tauri 命令。

use crate::error::AppError;
use crate::lan_usage::{
    aggregate, client, discovery, identity, storage, DeviceInfo, DiscoveredDevice,
    LanDailyTotal, LanDeviceStatus, LanShareSettings, LanUsageOverview,
};
use crate::store::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// 一台设备的同步结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanSyncResult {
    pub device_id: String,
    pub device_name: String,
    pub imported: i64,
    pub error: Option<String>,
}

/// 读取局域网共享设置。
#[tauri::command]
pub fn get_lan_share_settings(state: State<'_, AppState>) -> LanShareSettings {
    identity::share_settings(&state.db)
}

/// 保存局域网共享设置，并按新设置启停服务。
#[tauri::command]
pub async fn save_lan_share_settings(
    state: State<'_, AppState>,
    settings: LanShareSettings,
) -> Result<LanShareSettings, AppError> {
    identity::save_share_settings(&state.db, &settings)?;
    let db = state.db.clone();
    crate::lan_usage::ensure_server(db).await?;
    Ok(identity::share_settings(&state.db))
}

/// 本机在局域网里的身份。
#[tauri::command]
pub fn get_lan_device_info(state: State<'_, AppState>) -> Result<DeviceInfo, AppError> {
    identity::device_info(&state.db)
}

/// 扫描局域网，找出同网段的其它 cc-switch。
#[tauri::command]
pub async fn discover_lan_devices(
    state: State<'_, AppState>,
    timeout_ms: Option<u64>,
) -> Result<Vec<DiscoveredDevice>, AppError> {
    let settings = identity::share_settings(&state.db);
    let timeout = timeout_ms.unwrap_or(1200).clamp(200, 5000);
    let devices = discovery::discover(settings.port, timeout)
        .await
        .map_err(AppError::Message)?;
    // 把自己从扫描结果里剔掉
    let self_id = identity::device_id(&state.db).unwrap_or_default();
    Ok(devices
        .into_iter()
        .filter(|d| d.device_id != self_id)
        .collect())
}

/// 已登记的设备列表（含同步状态）。
#[tauri::command]
pub fn list_lan_devices(state: State<'_, AppState>) -> Result<Vec<LanDeviceStatus>, AppError> {
    storage::list_devices(&state.db)
}

/// 登记并连接一台设备，随后立刻同步一次。
#[tauri::command]
pub async fn connect_lan_device(
    state: State<'_, AppState>,
    device_id: String,
    device_name: String,
    host: String,
    port: Option<u16>,
) -> Result<LanDeviceStatus, AppError> {
    let port = port.unwrap_or(crate::lan_usage::DEFAULT_PORT);
    storage::register_device(&state.db, &device_id, &device_name, &host, port)?;
    // 登记后马上拉一次，用户点完就能看到数据
    match client::sync_device(&state.db, &device_id).await {
        Ok(_) => {}
        Err(e) => log::warn!("连接设备 {device_id} 后首次同步失败: {e}"),
    }
    storage::list_devices(&state.db)?
        .into_iter()
        .find(|d| d.device_id == device_id)
        .ok_or_else(|| AppError::Message("设备登记后未找到".to_string()))
}

/// 断开一台设备，并清掉它拉回来的用量。
#[tauri::command]
pub fn disconnect_lan_device(
    state: State<'_, AppState>,
    device_id: String,
) -> Result<(), AppError> {
    storage::remove_device(&state.db, &device_id)
}

/// 启用/停用一台设备（停用后保留已拉到的历史，只是不再更新）。
#[tauri::command]
pub fn set_lan_device_enabled(
    state: State<'_, AppState>,
    device_id: String,
    enabled: bool,
) -> Result<(), AppError> {
    storage::set_device_enabled(&state.db, &device_id, enabled)
}

/// 手动触发一次全量同步。
#[tauri::command]
pub async fn sync_lan_devices(state: State<'_, AppState>) -> Result<Vec<LanSyncResult>, AppError> {
    let db = state.db.clone();
    let devices = storage::list_devices(&db)?;
    let mut out = Vec::new();
    for device in devices {
        if !device.enabled {
            continue;
        }
        let result = match client::sync_device(&db, &device.device_id).await {
            Ok(n) => LanSyncResult {
                device_id: device.device_id.clone(),
                device_name: device.device_name.clone(),
                imported: n as i64,
                error: None,
            },
            Err(e) => LanSyncResult {
                device_id: device.device_id.clone(),
                device_name: device.device_name.clone(),
                imported: 0,
                error: Some(e.to_string()),
            },
        };
        out.push(result);
    }
    Ok(out)
}

/// 局域网用量总览：本机 + 各远端 + 合计。
#[tauri::command]
pub async fn get_lan_usage_overview(
    state: State<'_, AppState>,
    start_date: Option<i64>,
    end_date: Option<i64>,
) -> Result<LanUsageOverview, AppError> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || aggregate::overview(&db, start_date, end_date))
        .await
        .map_err(|e| AppError::Message(format!("局域网用量汇总任务失败: {e}")))?
}

/// 按天的跨设备合计。
#[tauri::command]
pub async fn get_lan_daily_totals(
    state: State<'_, AppState>,
    start_date: Option<i64>,
    end_date: Option<i64>,
) -> Result<Vec<LanDailyTotal>, AppError> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || storage::daily_totals(&db, start_date, end_date))
        .await
        .map_err(|e| AppError::Message(format!("局域网按天汇总任务失败: {e}")))?
}
