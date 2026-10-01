const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let pythonProcess = null;

// Получение пути к Python-серверу
function getServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'python-backend', 'server', 'server.exe');
  } else {
    return path.join(__dirname, '..', 'python-backend', 'server', 'server.exe');
  }
}

// Запуск Python-сервера
function startPythonServer(port = 8000) {
  const serverPath = getServerPath();
  
  if (!fs.existsSync(serverPath)) {
    console.error('[Electron] Python-сервер не найден:', serverPath);
    return null;
  }
  
  console.log('[Electron] Запуск Python-сервера:', serverPath);
  
  pythonProcess = spawn(serverPath, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHON_SERVER_PORT: String(port) },
    windowsHide: true
  });
  
  pythonProcess.stdout.on('data', (data) => {
    console.log('[PYTHON]', data.toString().trim());
  });
  
  pythonProcess.stderr.on('data', (data) => {
    console.error('[PYTHON ERR]', data.toString().trim());
  });
  
  pythonProcess.on('exit', (code) => {
    console.log('[Electron] Python-сервер завершил работу с кодом:', code);
    pythonProcess = null;
  });
  
  return pythonProcess;
}

// Ожидание готовности сервера
function waitForServer(url, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkServer = () => {
      fetch(url)
        .then(response => {
          if (response.ok) {
            resolve();
          } else {
            if (Date.now() - startTime > timeoutMs) {
              reject(new Error('Таймаут ожидания Python-сервера'));
            } else {
              setTimeout(checkServer, 500);
            }
          }
        })
        .catch(() => {
          if (Date.now() - startTime > timeoutMs) {
            reject(new Error('Таймаут ожидания Python-сервера'));
          } else {
            setTimeout(checkServer, 500);
          }
        });
    };
    
    checkServer();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // Загрузка контента
  if (!app.isPackaged) {
    // Dev-режим
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // Production-режим
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Открытие внешних ссылок в браузере
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Проверка обновлений
function checkForUpdates() {
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.checkForUpdates();
  }
}

// Обработчики событий autoUpdater
autoUpdater.on('update-available', (info) => {
  console.log('Доступно обновление:', info);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Обновление загружено:', info);
  
  dialog.showMessageBox({
    type: 'info',
    title: 'Доступно обновление',
    message: 'Новая версия приложения загружена. Хотите перезапустить сейчас?',
    buttons: ['Перезапустить сейчас', 'Позже']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on('error', (error) => {
  console.error('Ошибка при проверке обновлений:', error);
});

app.whenReady().then(async () => {
  // Запуск Python-сервера
  startPythonServer(8000);
  
  try {
    await waitForServer('http://127.0.0.1:8000/docs', 60000);
    console.log('[Electron] Python-сервер готов');
  } catch (err) {
    console.error('[Electron] Не дождались Python-сервера:', err);
    dialog.showErrorBox('Ошибка запуска', 'Python-сервер не запустился. Проверьте логи.');
  }
  
  createWindow();
  
  // Проверка обновлений только в packaged версии
  if (app.isPackaged) {
    checkForUpdates();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Функция для завершения Python-процесса
function killPythonProcess() {
  if (pythonProcess && !pythonProcess.killed) {
    console.log('[Electron] Завершение Python-сервера...');
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /PID ${pythonProcess.pid} /T /F`, { stdio: 'ignore' });
      } catch (err) {
        pythonProcess.kill();
      }
    } else {
      pythonProcess.kill('SIGTERM');
    }
    pythonProcess = null;
  }
});
