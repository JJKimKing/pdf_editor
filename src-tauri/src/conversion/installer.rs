use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use crate::conversion::engine::LibreOfficeEngine;
use crate::error::AppError;
use crate::settings::SettingsStore;

pub const INSTALL_PROGRESS_EVENT: &str = "engine://install-progress";

/// The Document Foundation's release-signing OpenPGP public key
/// (`LibreOffice Build Team (CODE SIGNING KEY) <build@documentfoundation.org>`,
/// fingerprint `C283 9ECA D940 8FBE 9531 C3E9 F434 A1EF AFEE AEA3`).
///
/// Provenance: the fingerprint was not typed in by hand — it was extracted
/// with a real OpenPGP parser (`pgp::composed::DetachedSignature`) from a
/// `.dmg.asc` signature file downloaded live over HTTPS from
/// `download.documentfoundation.org`. The key itself was then fetched by
/// that exact fingerprint from two independent keyservers (keys.openpgp.org
/// and keyserver.ubuntu.com), which returned byte-identical key material.
/// Both candidates were re-parsed and their fingerprint recomputed from the
/// key bytes (not read from the armor's human-readable "Comment:" line) to
/// confirm the match, and the key was proven to actually work by verifying
/// it against a real signed download end-to-end, not just a fingerprint
/// comparison. See conversion history for the exact commands.
///
/// `verify_signature` fails closed on any parse/verification error — this
/// must stay true even though the key above is real now; never weaken it to
/// "skip verification if the key is missing/invalid".
const RELEASE_PUBLIC_KEY: &str = include_str!("../../keys/documentfoundation_release.asc");

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InstallStage {
    ResolvingVersion,
    Downloading,
    Verifying,
    Installing,
    Done,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallProgress {
    pub stage: InstallStage,
    pub progress: u8,
    pub message: String,
    /// `false` when we can't compute a real percentage (server didn't send
    /// `Content-Length`) — the frontend should show an indeterminate/animated
    /// bar instead of trusting `progress` to move. Milestone transitions
    /// (resolving/verifying/installing/done/failed) are always `true`: their
    /// `progress` value is a real, if coarse, checkpoint.
    pub determinate: bool,
}

fn emit(app: &AppHandle, stage: InstallStage, progress: u8, determinate: bool, message: impl Into<String>) {
    let _ = app.emit(
        INSTALL_PROGRESS_EVENT,
        InstallProgress { stage, progress, determinate, message: message.into() },
    );
}

fn install_err(user_message: impl Into<String>, detail: impl Into<String>) -> AppError {
    AppError::EngineInstall { user_message: user_message.into(), detail: detail.into() }
}

fn net_err(e: reqwest::Error) -> AppError {
    install_err("网络请求失败，请检查网络连接后重试", e.to_string())
}

fn io_err(e: std::io::Error) -> AppError {
    install_err("文件操作失败", e.to_string())
}

/// Entry point: download + verify + silently install LibreOffice, emitting
/// `engine://install-progress` events throughout. Idempotent — if an engine
/// is already reachable (via the settings override or the normal
/// well-known-path search) this is a no-op success.
pub async fn install_libreoffice(app: &AppHandle, settings: &Arc<SettingsStore>) -> Result<(), AppError> {
    let existing = settings.get().libreoffice_path;
    if LibreOfficeEngine::detect(existing.as_deref()).is_ok() {
        emit(app, InstallStage::Done, 100, true, "已检测到 LibreOffice");
        return Ok(());
    }

    let result = run_platform_install(app, settings).await;
    match &result {
        Ok(()) => emit(app, InstallStage::Done, 100, true, "安装完成"),
        Err(e) => emit(app, InstallStage::Failed, 0, true, e.to_string()),
    }
    result
}

#[cfg(target_os = "windows")]
async fn run_platform_install(app: &AppHandle, _settings: &Arc<SettingsStore>) -> Result<(), AppError> {
    emit(
        app,
        InstallStage::Installing,
        20,
        true,
        "正在通过 winget 安装…（系统可能弹出一次授权确认框，请点击“是”完成安装）",
    );
    let output = tokio::process::Command::new("winget")
        .args([
            "install",
            "--id",
            "TheDocumentFoundation.LibreOffice",
            "--silent",
            "--accept-package-agreements",
            "--accept-source-agreements",
        ])
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => {}
        Ok(o) => {
            return Err(install_err(
                "winget 安装失败",
                String::from_utf8_lossy(&o.stderr).to_string(),
            ));
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(install_err(
                "未检测到 winget，暂不支持自动安装，请手动前往 libreoffice.org 下载安装",
                e.to_string(),
            ));
        }
        Err(e) => return Err(install_err("调用 winget 失败", e.to_string())),
    }

    if LibreOfficeEngine::detect(None).is_err() {
        return Err(install_err(
            "winget 报告安装成功，但未检测到转换程序，请重启软件后重试",
            "post-winget detect() still failed",
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
async fn run_platform_install(app: &AppHandle, settings: &Arc<SettingsStore>) -> Result<(), AppError> {
    emit(app, InstallStage::ResolvingVersion, 0, true, "正在获取版本信息…");

    // No blanket `.timeout()` here: reqwest's client-wide timeout caps the
    // *entire* request including the response body, and the installer
    // download is ~300MB — any total-duration cap short enough to catch a
    // truly dead connection quickly is also short enough to kill a normal
    // download on an ordinary connection, which showed up as a misleading
    // "网络请求失败" for what was actually just a slow-but-working transfer.
    // Only the connect phase gets a timeout; the transfer itself is unbounded.
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(net_err)?;
    let version = resolve_latest_version(&client).await?;
    emit(app, InstallStage::Downloading, 5, true, format!("已找到最新版本 {version}，开始下载…"));

    let (dmg_url, asc_url) = mac_asset_urls(&version);
    let download_dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("engine-downloads");
    tokio::fs::create_dir_all(&download_dir).await.map_err(io_err)?;
    let dmg_path = download_dir.join(format!("LibreOffice_{version}.dmg"));
    let asc_path = download_dir.join(format!("LibreOffice_{version}.dmg.asc"));

    let cleanup = || {
        let _ = std::fs::remove_file(&dmg_path);
        let _ = std::fs::remove_file(&asc_path);
    };

    if let Err(e) = download_with_progress(app, &client, &dmg_url, &dmg_path, (5, 85)).await {
        cleanup();
        return Err(e);
    }
    if let Err(e) = download_with_progress(app, &client, &asc_url, &asc_path, (85, 90)).await {
        cleanup();
        return Err(e);
    }

    emit(app, InstallStage::Verifying, 92, true, "正在校验安装包签名…");
    if let Err(e) = verify_signature(&dmg_path, &asc_path) {
        cleanup();
        return Err(e);
    }

    emit(app, InstallStage::Installing, 95, true, "正在安装…");
    let soffice_path = match install_mac(app, &dmg_path).await {
        Ok(p) => p,
        Err(e) => {
            cleanup();
            return Err(e);
        }
    };
    cleanup();

    if LibreOfficeEngine::detect(soffice_path.to_str()).is_err() {
        return Err(install_err(
            "安装完成但未检测到可用的转换程序",
            format!("expected soffice at {}", soffice_path.display()),
        ));
    }

    let mut new_settings = settings.get();
    new_settings.libreoffice_path = Some(soffice_path.to_string_lossy().to_string());
    settings.update(new_settings).map_err(|e| install_err("已安装但保存设置失败", e.to_string()))?;

    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
async fn run_platform_install(_app: &AppHandle, _settings: &Arc<SettingsStore>) -> Result<(), AppError> {
    Err(install_err("当前平台暂不支持一键安装", std::env::consts::OS))
}

#[cfg(target_os = "macos")]
async fn resolve_latest_version(client: &reqwest::Client) -> Result<String, AppError> {
    let body = client
        .get("https://download.documentfoundation.org/libreoffice/stable/")
        .send()
        .await
        .map_err(net_err)?
        .text()
        .await
        .map_err(net_err)?;
    parse_latest_version(&body)
        .ok_or_else(|| install_err("无法解析 LibreOffice 版本列表", "no version dirs found in directory listing"))
}

/// Extract the highest `X.Y.Z` version folder name from an Apache autoindex
/// directory listing page. Kept free of network/IO so it's unit-testable
/// against a saved HTML fixture.
fn parse_latest_version(html: &str) -> Option<String> {
    let re = regex::Regex::new(r#"href="(\d+)\.(\d+)\.(\d+)/""#).ok()?;
    re.captures_iter(html)
        .filter_map(|c| {
            let a: u32 = c.get(1)?.as_str().parse().ok()?;
            let b: u32 = c.get(2)?.as_str().parse().ok()?;
            let d: u32 = c.get(3)?.as_str().parse().ok()?;
            Some((a, b, d))
        })
        .max()
        .map(|(a, b, d)| format!("{a}.{b}.{d}"))
}

#[cfg(target_os = "macos")]
fn mac_asset_urls(version: &str) -> (String, String) {
    let arch_dir = std::env::consts::ARCH; // "x86_64" or "aarch64"
    let arch_file = if arch_dir == "x86_64" { "x86-64" } else { arch_dir };
    let dmg = format!(
        "https://download.documentfoundation.org/libreoffice/stable/{version}/mac/{arch_dir}/LibreOffice_{version}_MacOS_{arch_file}.dmg"
    );
    let asc = format!("{dmg}.asc");
    (dmg, asc)
}

#[cfg(target_os = "macos")]
async fn download_with_progress(
    app: &AppHandle,
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    progress_range: (u8, u8),
) -> Result<(), AppError> {
    let mut resp = client.get(url).send().await.map_err(net_err)?;
    if !resp.status().is_success() {
        return Err(install_err(format!("下载失败: HTTP {}", resp.status()), url.to_string()));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(dest).await.map_err(io_err)?;
    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = resp.chunk().await.map_err(net_err)? {
        file.write_all(&chunk).await.map_err(io_err)?;
        downloaded += chunk.len() as u64;
        // Tick on a timer regardless of whether we know the total size —
        // gating this on `total > 0` left the UI frozen for the whole
        // download whenever the server (or a mirror redirect) omitted
        // Content-Length, which looked indistinguishable from "stuck" and
        // is exactly what made a real user re-click install repeatedly.
        if last_emit.elapsed() > Duration::from_millis(200) {
            if total > 0 {
                let frac = downloaded as f64 / total as f64;
                let pct = progress_range.0 as f64 + frac * (progress_range.1 - progress_range.0) as f64;
                emit(
                    app,
                    InstallStage::Downloading,
                    pct as u8,
                    true,
                    format!("正在下载 {}%", (frac * 100.0) as u32),
                );
            } else {
                emit(
                    app,
                    InstallStage::Downloading,
                    progress_range.0,
                    false,
                    format!("正在下载… 已下载 {:.1} MB", downloaded as f64 / 1_000_000.0),
                );
            }
            last_emit = std::time::Instant::now();
        }
    }
    file.flush().await.map_err(io_err)?;
    Ok(())
}

/// The message every verification failure path shows the user. Deliberately
/// generic and non-technical — "内置密钥占位符未替换" etc. is developer
/// context that belongs in `detail()`, not the primary message a regular
/// user has to make sense of. Whatever the exact cause, the actionable
/// takeaway for a user is always the same: nothing was installed, the
/// machine is untouched, here's a fallback that isn't blocked on us.
const VERIFY_FAILED_MESSAGE: &str =
    "安装包安全校验未通过，已自动停止安装，你的电脑没有被改动。可以稍后重试，或前往 libreoffice.org 官网手动下载安装。";

#[cfg(target_os = "macos")]
fn verify_signature(data_path: &Path, sig_path: &Path) -> Result<(), AppError> {
    use pgp::composed::{Deserializable, DetachedSignature, SignedPublicKey};

    let (public_key, _) = SignedPublicKey::from_armor_single(RELEASE_PUBLIC_KEY.as_bytes())
        .map_err(|e| install_err(VERIFY_FAILED_MESSAGE, format!("embedded release public key failed to parse: {e}")))?;
    let (signature, _) = DetachedSignature::from_armor_file(sig_path)
        .map_err(|e| install_err(VERIFY_FAILED_MESSAGE, format!("signature file failed to parse: {e}")))?;
    let data = std::fs::read(data_path).map_err(io_err)?;
    signature
        .verify(&public_key, &data)
        .map_err(|e| install_err(VERIFY_FAILED_MESSAGE, format!("signature verification failed: {e}")))?;
    Ok(())
}

#[cfg(target_os = "macos")]
async fn install_mac(app: &AppHandle, dmg_path: &Path) -> Result<PathBuf, AppError> {
    let mount_point = std::env::temp_dir().join(format!("pdftoolkit-lo-mount-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&mount_point).await.map_err(io_err)?;

    let status = tokio::process::Command::new("hdiutil")
        .arg("attach")
        .arg(dmg_path)
        .args(["-nobrowse", "-mountpoint"])
        .arg(&mount_point)
        .status()
        .await
        .map_err(io_err)?;
    if !status.success() {
        let _ = tokio::fs::remove_dir_all(&mount_point).await;
        return Err(install_err("挂载安装镜像失败", format!("hdiutil attach exit {:?}", status.code())));
    }

    let unmount = |mount_point: PathBuf| async move {
        let _ = tokio::process::Command::new("hdiutil")
            .args(["detach"])
            .arg(&mount_point)
            .arg("-quiet")
            .status()
            .await;
        let _ = tokio::fs::remove_dir_all(&mount_point).await;
    };

    let app_bundle_src = mount_point.join("LibreOffice.app");
    let dest_root = match app.path().app_data_dir() {
        Ok(d) => d.join("engine"),
        Err(e) => {
            unmount(mount_point).await;
            return Err(install_err("无法定位应用数据目录", e.to_string()));
        }
    };
    if let Err(e) = std::fs::create_dir_all(&dest_root) {
        unmount(mount_point).await;
        return Err(io_err(e));
    }
    let app_bundle_dest = dest_root.join("LibreOffice.app");
    if app_bundle_dest.exists() {
        let _ = std::fs::remove_dir_all(&app_bundle_dest);
    }
    if let Err(e) = copy_dir_recursive(&app_bundle_src, &app_bundle_dest) {
        unmount(mount_point).await;
        return Err(e);
    }

    unmount(mount_point).await;
    Ok(app_bundle_dest.join("Contents/MacOS/soffice"))
}

/// `std::fs` has no recursive directory copy; `LibreOffice.app` is a
/// directory bundle so we need one. Preserves symlinks (the bundle has
/// several, e.g. Frameworks version links) rather than following them into
/// duplicated content.
#[cfg(target_os = "macos")]
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(dst).map_err(io_err)?;
    for entry in std::fs::read_dir(src).map_err(io_err)? {
        let entry = entry.map_err(io_err)?;
        let file_type = entry.file_type().map_err(io_err)?;
        let dest_path = dst.join(entry.file_name());
        if file_type.is_symlink() {
            let target = std::fs::read_link(entry.path()).map_err(io_err)?;
            std::os::unix::fs::symlink(&target, &dest_path).map_err(io_err)?;
        } else if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), &dest_path).map_err(io_err)?;
        }
    }
    Ok(())
}
