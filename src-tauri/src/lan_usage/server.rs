//! 对端服务：把本机「本地文件解析」出来的用量，通过只读 HTTP 接口共享出去，
//! 同时用 UDP 广播应答局域网里的发现请求。
//!
//! 只有用户在设置里打开「局域网共享」后才会启动。服务对外只暴露用量统计，
//! 不碰任何配置、凭据或会话内容。

use super::{identity, storage, DeviceInfo, UsageExport};
use crate::database::Database;
use crate::error::AppError;
use axum::http::StatusCode;
use axum::{extract::State, routing::get, Json, Router};
use std::sync::Arc;
use tokio::sync::watch;

/// 运行中的局域网服务句柄。
pub struct LanServerHandle {
    pub port: u16,
    stop_tx: watch::Sender<bool>,
}

impl LanServerHandle {
    /// 停掉 HTTP 服务和 UDP 应答。
    pub fn stop(&self) {
        let _ = self.stop_tx.send(true);
    }
}

/// 服务内部的共享状态。
struct ServerState {
    db: Arc<Database>,
}

/// 启动 HTTP 服务与 UDP 发现应答。
///
/// 端口被占用时返回错误（上层会记日志并提示用户改端口）。
pub async fn start(db: Arc<Database>, port: u16) -> Result<LanServerHandle, AppError> {
    let state = Arc::new(ServerState { db });
    let app = Router::new()
        .route("/api/lan/info", get(info_handler))
        .route("/api/lan/usage", get(usage_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| AppError::Message(format!("局域网用量服务端口 {port} 绑定失败: {e}")))?;
    let bound_port = listener.local_addr().map(|a| a.port()).unwrap_or(port);

    let (stop_tx, mut stop_rx) = watch::channel(false);

    let mut http_stop = stop_tx.subscribe();
    let http_task = tokio::spawn(async move {
        let shutdown = async move {
            let _ = http_stop.wait_for(|stop| *stop).await;
        };
        if let Err(e) = axum::serve(listener, app)
            .with_graceful_shutdown(shutdown)
            .await
        {
            log::error!("局域网用量 HTTP 服务退出: {e}");
        }
    });

    let mut udp_stop = stop_tx.subscribe();
    let udp_db = db.clone();
    let udp_task = tokio::spawn(async move {
        if let Err(e) = run_discovery_responder(udp_db, bound_port, udp_stop).await {
            log::warn!("局域网发现应答服务退出: {e}");
        }
    });

    tokio::spawn(async move {
        let _ = http_task.await;
        let _ = udp_task.await;
    });

    Ok(LanServerHandle {
        port: bound_port,
        stop_tx,
    })
}

/// handler 的错误类型。`AppError` 没实现 axum 的 `IntoResponse`，
/// 这里用 (状态码, 说明) 这种直接可响应的形式。
type HandlerError = (StatusCode, String);

/// `GET /api/lan/info`：自我介绍。
async fn info_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<DeviceInfo>, HandlerError> {
    let info = identity::device_info(&state.db)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(info))
}

/// `GET /api/lan/usage`：导出本机共享范围内的用量。
async fn usage_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<UsageExport>, HandlerError> {
    let device = identity::device_info(&state.db)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let (events, daily) = storage::export_local_usage(&state.db)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(UsageExport {
        device,
        events,
        daily,
    }))
}

/// UDP 发现应答：收到探测包就把本机身份回给发送方。
async fn run_discovery_responder(
    db: Arc<Database>,
    port: u16,
    mut stop_rx: watch::Receiver<bool>,
) -> Result<(), AppError> {
    let socket = tokio::net::UdpSocket::bind(("0.0.0.0", port))
        .await
        .map_err(|e| AppError::Message(format!("局域网发现端口 {port} 绑定失败: {e}")))?;
    let mut buf = vec![0u8; 512];
    loop {
        tokio::select! {
            _ = stop_rx.wait_for(|stop| *stop) => return Ok(()),
            result = socket.recv_from(&mut buf) => {
                let Ok((len, peer)) = result else { continue };
                let probe = String::from_utf8_lossy(&buf[..len]);
                if !probe.trim().starts_with(super::DISCOVERY_MAGIC) {
                    continue;
                }
                // 身份取不到就别回：对方会再广播一次。
                if let Ok(info) = identity::device_info(&db) {
                    if let Ok(payload) = serde_json::to_vec(&info) {
                        let _ = socket.send_to(&payload, peer).await;
                    }
                }
            }
        }
    }
}
