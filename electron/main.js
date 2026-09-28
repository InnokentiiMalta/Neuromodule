const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
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

app.whenReady().then(() => {
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
