const { app, BrowserWindow, ipcMain } = require('electron')

const createWindow = () => {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadFile('index.html')
}

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData')
})

app.whenReady().then(() => {
  createWindow()
})