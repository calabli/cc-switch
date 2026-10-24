//! 局域网发现：广播一个探测包，收集同网段其它 cc-switch 的回应。
//!
//! 用 UDP 广播是为了「快速连接」——用户不用手输 IP，点一下扫描就能看到同网段的
//! 设备。广播被网络策略挡掉时还能手动填 IP 走 HTTP 直连。

use super::{DeviceInfo, DiscoveredDevice, DISCOVERY_MAGIC};
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

/// 扫描局域网，返回发现的设备。
///
/// 同一次扫描里同一个 `device_id` 只保留一条（先到先得）。
pub async fn discover(port: u16, timeout_ms: u64) -> Result<Vec<DiscoveredDevice>, String> {
    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| format!("打开发现端口失败: {e}"))?;
    socket
        .set_broadcast(true)
        .map_err(|e| format!("开启广播失败: {e}"))?;

    let probe = format!("{DISCOVERY_MAGIC}\n");
    for target in broadcast_targets(port).await {
        let _ = socket.send_to(probe.as_bytes(), target).await;
    }

    let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms.max(200));
    let mut buf = vec![0u8; 2048];
    let mut found: HashMap<String, DiscoveredDevice> = HashMap::new();

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        let recv = tokio::time::timeout(remaining, socket.recv_from(&mut buf)).await;
        let Ok(Ok((len, peer))) = recv else { break };
        let Ok(info) = serde_json::from_slice::<DeviceInfo>(&buf[..len]) else {
            continue;
        };
        if info.device_id.trim().is_empty() {
            continue;
        }
        found
            .entry(info.device_id.clone())
            .or_insert(DiscoveredDevice {
                device_id: info.device_id,
                device_name: info.device_name,
                app_version: info.app_version,
                host: peer.ip().to_string(),
                port,
            });
    }

    let mut devices: Vec<DiscoveredDevice> = found.into_values().collect();
    devices.sort_by(|a, b| {
        a.device_name
            .to_lowercase()
            .cmp(&b.device_name.to_lowercase())
    });
    Ok(devices)
}

/// 广播目标：受限广播地址 + 本机各网段的定向广播地址。
///
/// 定向广播按 /24 猜——家用和办公网几乎都是 /24，拿不到网卡列表时这是最省事的
/// 兜底；猜错了也不影响 255.255.255.255 那条路径。
async fn broadcast_targets(port: u16) -> Vec<SocketAddr> {
    let mut targets = vec![SocketAddr::new(IpAddr::V4(Ipv4Addr::BROADCAST), port)];
    for ip in local_outbound_ipv4().await {
        let mut octets = ip.octets();
        octets[3] = 255;
        targets.push(SocketAddr::new(IpAddr::V4(Ipv4Addr::from(octets)), port));
    }
    targets
}

/// 取本机出站用的 IPv4 地址。
///
/// 用「UDP connect 到一个公网地址」来问系统默认路由会选哪个源 IP——不会真的发包。
async fn local_outbound_ipv4() -> Vec<Ipv4Addr> {
    let mut out = Vec::new();
    if let Ok(socket) = tokio::net::UdpSocket::bind("0.0.0.0:0").await {
        if socket.connect("8.8.8.8:80").await.is_ok() {
            if let Ok(addr) = socket.local_addr() {
                if let IpAddr::V4(v4) = addr.ip() {
                    if !v4.is_loopback() && !v4.is_unspecified() {
                        out.push(v4);
                    }
                }
            }
        }
    }
    out
}
