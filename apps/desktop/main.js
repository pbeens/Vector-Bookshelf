const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const fs = require('fs');

// Set app name BEFORE any other logic
app.name = app.isPackaged 
    ? "Vector Bookshelf" 
    : "Vector Bookshelf Dev";

let mainWindow;
let serverProcess;
let buildInfo = { build: 0, timestamp: 'N/A' };

// Load and Auto-Increment Dev Build Info
const devBuildFile = path.join(__dirname, 'dev-build.json');
if (!app.isPackaged && fs.existsSync(devBuildFile)) {
  try {
    buildInfo = JSON.parse(fs.readFileSync(devBuildFile, 'utf8'));
    buildInfo.build = (buildInfo.build || 0) + 1;
    buildInfo.timestamp = new Date().toLocaleString();
    fs.writeFileSync(devBuildFile, JSON.stringify(buildInfo, null, 2));
    console.log(`[Dev] Auto-incremented build to ${buildInfo.build}`);
  } catch (e) {
    console.error('Failed to load/update build info:', e);
  }
} else if (fs.existsSync(devBuildFile)) {
    // Just read for packaged apps (unlikely to use this file but for consistency)
    try {
        buildInfo = JSON.parse(fs.readFileSync(devBuildFile, 'utf8'));
    } catch (e) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png')
  });

  // Load Release Build Info if available
  const releaseBuildFile = path.join(__dirname, 'build-info.json');
  let releaseTimestamp = '';
  if (fs.existsSync(releaseBuildFile)) {
    try {
      const info = JSON.parse(fs.readFileSync(releaseBuildFile, 'utf8'));
      releaseTimestamp = info.timestamp;
    } catch (e) {}
  }

  const fullTitle = app.isPackaged 
    ? `${app.name} v${app.getVersion()} (${releaseTimestamp || new Date().toISOString().split('T')[0]})`
    : `${app.name} Dev | Build ${buildInfo.build} | ${buildInfo.timestamp} | ${app.getPath('userData')}`;

  mainWindow.setTitle(fullTitle);

  // Wait for server to be ready before loading UI
  const checkServer = () => {
    http.get('http://localhost:3001/api/health', (res) => {
      console.log('Server is ready, loading UI...');
      // Force clear cache for dev builds
      if (!app.isPackaged) {
          mainWindow.webContents.session.clearCache().then(() => {
              mainWindow.loadURL('http://localhost:3001');
          });
      } else {
          mainWindow.loadURL('http://localhost:3001');
      }
    }).on('error', () => {
      console.log('Waiting for server...');
      setTimeout(checkServer, 1000);
    });
  };

  checkServer();
  
  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  // Maintain authoritative title
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle(fullTitle);
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.setTitle(fullTitle);
  });
}

function startServer() {
  let serverPath;
  let cwdPath;

  if (app.isPackaged) {
    // In production with extraResources, the API is adjacent to app.asar
    const resourcesPath = path.join(process.resourcesPath, 'api');
    
    if (require('fs').existsSync(resourcesPath)) {
        console.log('Using external API resources');
        serverPath = path.join(resourcesPath, 'src/server/index.js');
        cwdPath = resourcesPath;
    } else {
        // Fallback (unlikely if package.json is correct)
        console.log('Using bundled API resources (ASAR) - Fallback');
        serverPath = path.join(__dirname, 'api/src/server/index.js');
        cwdPath = path.join(__dirname, 'api');
    }
  } else {
    // In development, resources are in sibling directories
    serverPath = path.join(__dirname, '../api/src/server/index.js');
    cwdPath = path.join(__dirname, '../api');
  }

  const logFile = path.join(app.getPath('userData'), 'server_debug.log');
  const log = (msg) => {
    try {
      require('fs').appendFileSync(logFile, msg + '\n');
    } catch (e) {}
    console.log(msg);
  };
  
  log(`Starting app (${app.isPackaged ? 'PACKAGED' : 'DEV'})...`);
  log('User Data Path: ' + app.getPath('userData'));
  log('Server Path: ' + serverPath);
  log('CWD: ' + cwdPath);

  console.log('Launching Server at:', serverPath);
  
  // Use pipe to capture output
  serverProcess = fork(serverPath, [], {
    cwd: cwdPath,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { 
      ...process.env, 
      ELECTRON_RUN_AS_NODE: '1',
      USER_DATA_PATH: app.getPath('userData'),
      IS_PACKAGED: app.isPackaged ? 'true' : 'false'
    }
  });

  serverProcess.stdout.on('data', (data) => {
    const msg = `[API] ${data.toString().trim()}`;
    log(msg);
  });

  serverProcess.stderr.on('data', (data) => {
    const msg = `[API ERROR] ${data.toString().trim()}`;
    log(msg);
  });

  serverProcess.on('message', (msg) => {
    log('[API Message] ' + JSON.stringify(msg));
  });
  
  serverProcess.on('exit', (code) => {
    const msg = `[API WRAPPER] Server process exited with code ${code}`;
    log(msg);
  });
}

app.on('ready', () => {
  // STARTUP DIAGNOSTIC
  console.log('--------------------------------------------------');
  console.log(`[STARTUP] Mode: ${app.isPackaged ? 'PACKAGED' : 'DEV'}`);
  console.log(`[STARTUP] App Name: ${app.name}`);
  if (!app.isPackaged) {
    console.log(`[STARTUP] Build: ${buildInfo.build} (${buildInfo.timestamp})`);
  }
  console.log(`[STARTUP] UserData: ${app.getPath('userData')}`);
  console.log('--------------------------------------------------');
  
  startServer();
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

// Diagnostic IPC
ipcMain.handle('app:getInfo', () => {
  return {
    isPackaged: app.isPackaged,
    userDataPath: app.getPath('userData'),
    appName: app.name,
    version: app.getVersion(),
    build: buildInfo.build,
    buildTimestamp: buildInfo.timestamp
  };
});

// Open local path
ipcMain.handle('app:openPath', async (event, fullPath) => {
  if (!fullPath) return;
  try {
    await shell.openPath(fullPath);
    return true;
  } catch (e) {
    console.error('Failed to open path:', e);
    return false;
  }
});

// Show in folder
ipcMain.handle('app:showItemInFolder', async (event, fullPath) => {
  if (!fullPath) return;
  try {
    shell.showItemInFolder(fullPath);
    return true;
  } catch (e) {
    console.error('Failed to show item in folder:', e);
    return false;
  }
});

app.on('quit', () => {
  if (serverProcess) {
    console.log('Killing server process...');
    serverProcess.kill();
  }
});
