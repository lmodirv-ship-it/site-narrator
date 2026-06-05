// Hn-MAKER Desktop (Electron wrapper)
// يفتح الواجهة المنشورة في نافذة سطح مكتب، ويُشغّل local-server في الخلفية
// لإنتاج MP4 الحقيقي عبر Playwright + FFmpeg.

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

const APP_URL =
  process.env.HN_APP_URL ||
  "https://site-narrator.lovable.app";

const LOCAL_SERVER_PORT = 5174;
let localServerProc = null;
let mainWindow = null;

function startLocalServer() {
  try {
    // في نسخة @electron/packager المعبأة، الملفات الإضافية تكون داخل resources/
    const candidates = [
      path.join(__dirname, "..", "local-server", "src", "index.js"),
      path.join(process.resourcesPath || "", "local-server", "src", "index.js"),
    ];
    const entry = candidates.find((p) => p && fs.existsSync(p));
    if (!entry) {
      console.warn("[local-server] entry not found, skipping autostart");
      return;
    }
    console.log("[local-server] starting:", entry);
    localServerProc = spawn(process.execPath, [entry], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(LOCAL_SERVER_PORT) },
      stdio: "inherit",
    });
    localServerProc.on("exit", (code) => {
      console.log("[local-server] exited:", code);
      localServerProc = null;
    });
  } catch (e) {
    console.error("[local-server] failed to start:", e);
  }
}

function stopLocalServer() {
  if (localServerProc && !localServerProc.killed) {
    try { localServerProc.kill(); } catch { /* noop */ }
  }
  localServerProc = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Hn-MAKER",
    backgroundColor: "#0b0b14",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // فتح الروابط الخارجية في المتصفح الافتراضي بدلاً من نوافذ Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(APP_URL);

  // قائمة بسيطة: إعادة تحميل + تكبير/تصغير + أدوات المطور
  const menu = Menu.buildFromTemplate([
    {
      label: "ملف",
      submenu: [
        { role: "reload", label: "تحديث" },
        { role: "forceReload", label: "تحديث قسري" },
        { type: "separator" },
        { role: "quit", label: "خروج" },
      ],
    },
    {
      label: "عرض",
      submenu: [
        { role: "zoomIn", label: "تكبير" },
        { role: "zoomOut", label: "تصغير" },
        { role: "resetZoom", label: "إعادة" },
        { type: "separator" },
        { role: "togglefullscreen", label: "ملء الشاشة" },
        { role: "toggleDevTools", label: "أدوات المطور" },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  startLocalServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopLocalServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopLocalServer);
