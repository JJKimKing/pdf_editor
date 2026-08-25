import { useCallback, useEffect, useState } from "react";
import { NAV_ITEMS, type ViewId } from "./app/routes";
import { settingsApi } from "./api/settings";
import { applyTheme } from "./utils/theme";
import { ContextMenuHost } from "./components/shell/ContextMenu";
import { DialogHost } from "./components/shell/Dialog";
import { Sidebar } from "./components/shell/Sidebar";
import { StatusBar } from "./components/shell/StatusBar";
import { ToastHost } from "./components/shell/Toast";
import { DocxToPdfPage } from "./pages/DocxToPdfPage";
import { GrayscalePage } from "./pages/GrayscalePage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { MetadataPage } from "./pages/MetadataPage";
import { PdfToDocxPage } from "./pages/PdfToDocxPage";
import { SettingsPage } from "./pages/SettingsPage";
import { navigationGuard } from "./stores/navigationGuardStore";
import { useActiveTaskCount } from "./stores/taskStore";
import "./App.css";
import "./styles/theme.css";

const APP_VERSION = "0.1.0";

function App() {
  const [view, setView] = useState<ViewId>("home");
  const [metadataStatus, setMetadataStatus] = useState<string | undefined>();
  const [grayscaleStatus, setGrayscaleStatus] = useState<string | undefined>();
  const activeTaskCount = useActiveTaskCount();

  useEffect(() => {
    settingsApi.get().then((s) => applyTheme(s.theme)).catch(() => {});
  }, []);

  const handleNavigate = useCallback(
    async (next: ViewId) => {
      if (next === view) return;
      const canLeave = await navigationGuard.check();
      if (canLeave) setView(next);
    },
    [view],
  );

  const validNavItems = new Set([...NAV_ITEMS.map((i) => i.id), "settings"]);
  const activeView = validNavItems.has(view) ? view : "home";

  return (
    <div className="app-shell">
      <div className="app-body">
        <Sidebar active={activeView} onNavigate={handleNavigate} activeTaskCount={activeTaskCount} />
        <main className="app-main">
          {view === "home" && <HomePage onNavigate={handleNavigate} />}
          {view === "pdf-to-docx" && <PdfToDocxPage />}
          {view === "docx-to-pdf" && <DocxToPdfPage />}
          {view === "metadata" && <MetadataPage onStatusChange={setMetadataStatus} />}
          {view === "grayscale" && <GrayscalePage onStatusChange={setGrayscaleStatus} />}
          {view === "history" && <HistoryPage onNavigate={handleNavigate} />}
          {view === "settings" && <SettingsPage />}
        </main>
      </div>
      <StatusBar
        context={view === "metadata" ? metadataStatus : view === "grayscale" ? grayscaleStatus : undefined}
        version={APP_VERSION}
      />
      <ToastHost />
      <DialogHost />
      <ContextMenuHost />
    </div>
  );
}

export default App;
