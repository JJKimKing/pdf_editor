import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { conversionApi } from "../api/conversion";
import { settingsApi } from "../api/settings";
import { FolderIcon } from "../components/shell/icons";
import { engineInstallStore, useEngineInstall } from "../stores/engineInstallStore";
import { toastStore } from "../stores/toastStore";
import type { Settings } from "../types/settings";
import { isMac } from "../utils/platform";
import { applyTheme } from "../utils/theme";
import "./SettingsPage.css";

type Section = "general" | "output" | "conversion" | "appearance" | "about";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "常规设置" },
  { id: "output", label: "输出设置" },
  { id: "conversion", label: "转换设置" },
  { id: "appearance", label: "界面设置" },
  { id: "about", label: "关于" },
];

export function SettingsPage() {
  const [section, setSection] = useState<Section>("general");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [engineFound, setEngineFound] = useState<boolean | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const install = useEngineInstall();
  const installing = install.stage !== "idle" && install.stage !== "done" && install.stage !== "failed";

  useEffect(() => {
    settingsApi.get().then(setSettings);
    conversionApi.checkEngine().then(setEngineFound);
    getVersion().then(setAppVersion).catch(() => setAppVersion("0.1.0"));
  }, []);

  async function handleInstallEngine() {
    await engineInstallStore.install();
    conversionApi.checkEngine().then(setEngineFound);
  }

  async function save(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.theme) applyTheme(patch.theme);
    try {
      await settingsApi.update(next);
    } catch (err) {
      toastStore.push("error", String(err));
    }
  }

  async function pickOutputDir() {
    const selected = await open({ directory: true });
    if (typeof selected === "string") save({ defaultOutputDir: selected });
  }

  if (!settings) return <div className="settings-page settings-page--loading">加载中…</div>;

  return (
    <div className="settings-page">
      <aside className="settings-page__nav">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`settings-page__nav-item${section === s.id ? " settings-page__nav-item--active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </aside>

      <div className="settings-page__content">
        {section === "general" && (
          <section className="settings-section">
            <h2 className="settings-section__title">常规设置</h2>
            <SettingRow label="开机启动" description="登录系统后自动启动 PDF Toolkit">
              <Toggle checked={settings.launchAtStartup} onChange={(v) => save({ launchAtStartup: v })} />
            </SettingRow>
            <SettingRow label="转换完成后打开文件夹" description="转换任务成功后自动打开输出目录">
              <Toggle
                checked={settings.openFolderAfterConversion}
                onChange={(v) => save({ openFolderAfterConversion: v })}
              />
            </SettingRow>
          </section>
        )}

        {section === "output" && (
          <section className="settings-section">
            <h2 className="settings-section__title">输出设置</h2>
            <SettingRow label="默认输出目录" description="新建转换任务时预填的输出位置">
              <div className="settings-page__path-row">
                <span className="settings-page__path">{settings.defaultOutputDir || "未设置"}</span>
                <button type="button" className="settings-page__pick" onClick={pickOutputDir}>
                  <FolderIcon />
                  选择
                </button>
              </div>
            </SettingRow>
            <SettingRow label="同名文件处理" description="输出目录中已存在同名文件时的处理方式">
              <select
                className="settings-page__select"
                value={settings.duplicatePolicy}
                onChange={(e) => save({ duplicatePolicy: e.target.value as Settings["duplicatePolicy"] })}
              >
                <option value="ask">询问</option>
                <option value="rename">自动重命名</option>
                <option value="overwrite">覆盖</option>
              </select>
            </SettingRow>
          </section>
        )}

        {section === "conversion" && (
          <section className="settings-section">
            <h2 className="settings-section__title">转换设置</h2>
            <SettingRow label="转换引擎" description="PDF ↔ DOCX 由本机安装的 LibreOffice 提供">
              {!installing && install.stage !== "failed" && (
                <div className="settings-page__engine-control">
                  <span className={`settings-page__engine-badge${engineFound ? " settings-page__engine-badge--ok" : ""}`}>
                    {engineFound === null ? "检测中…" : engineFound ? "已安装" : "未检测到"}
                  </span>
                  {engineFound === false && (
                    <button type="button" className="settings-page__install-btn" onClick={handleInstallEngine}>
                      一键安装
                    </button>
                  )}
                </div>
              )}
              {installing && (
                <div className="settings-page__install-progress-wrap">
                  <div
                    className={`settings-page__install-progress${install.determinate ? "" : " settings-page__install-progress--indeterminate"}`}
                  >
                    {install.determinate ? (
                      <div
                        className="settings-page__install-progress__fill"
                        style={{ width: `${Math.max(4, install.progress)}%` }}
                      />
                    ) : (
                      <div className="settings-page__install-progress__fill settings-page__install-progress__fill--indeterminate" />
                    )}
                  </div>
                  <span className="settings-page__install-message">{install.message}</span>
                </div>
              )}
              {install.stage === "failed" && (
                // Same slot the progress bar was just in, not a disappearing
                // act followed by an unrelated block below — a bar frozen in
                // "stopped" red reads as "this is where it broke", not "did
                // something even happen?".
                <div className="settings-page__install-progress-wrap">
                  <div className="settings-page__install-progress settings-page__install-progress--stopped">
                    <div
                      className="settings-page__install-progress__fill settings-page__install-progress__fill--stopped"
                      style={{ width: `${Math.max(4, install.progress)}%` }}
                    />
                  </div>
                  <button type="button" className="settings-page__install-retry" onClick={handleInstallEngine}>
                    重试
                  </button>
                </div>
              )}
            </SettingRow>
            {installing && !isMac && (
              <div className="settings-page__install-hint">
                安装过程中系统可能弹出一次授权确认框，请点击"是"完成安装。
              </div>
            )}
            {install.stage === "failed" && (
              <div className="settings-page__install-hint settings-page__install-hint--error">
                {install.error}
                {" "}前往{" "}
                <a href="https://www.libreoffice.org/download/download-libreoffice/" target="_blank" rel="noreferrer">
                  libreoffice.org
                </a>{" "}
                手动下载安装
              </div>
            )}
            <SettingRow label="并发转换数" description="同时处理的文件数量，数值越大占用资源越多">
              <select
                className="settings-page__select"
                value={settings.maxConcurrency}
                onChange={(e) => save({ maxConcurrency: Number(e.target.value) })}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </SettingRow>
          </section>
        )}

        {section === "appearance" && (
          <section className="settings-section">
            <h2 className="settings-section__title">界面设置</h2>
            <SettingRow label="主题" description="浅色已完整适配，深色/跟随系统为基础配色">
              <select
                className="settings-page__select"
                value={settings.theme}
                onChange={(e) => save({ theme: e.target.value as Settings["theme"] })}
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </SettingRow>
          </section>
        )}

        {section === "about" && (
          <section className="settings-section">
            <h2 className="settings-section__title">关于</h2>
            <div className="about-block">
              <div className="about-block__logo">P</div>
              <div className="about-block__name">PDF Toolkit</div>
              <div className="about-block__meta">版本 {appVersion}</div>
              <div className="about-block__meta">运行环境 {isMac ? "macOS" : "Windows"}</div>
              <div className="about-block__meta">© {new Date().getFullYear()} PDF Toolkit</div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <div className="setting-row__label">{label}</div>
        <div className="setting-row__description">{description}</div>
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`toggle${checked ? " toggle--on" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="toggle__thumb" />
    </button>
  );
}
