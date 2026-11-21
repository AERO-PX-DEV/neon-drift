// Desktop shell: opens the built game (dist/) in its own fullscreen window, no browser chrome.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // no menu bar, and no Ctrl+W/Ctrl+R shortcuts (Ctrl is "descend" in the game)
  const win = new BrowserWindow({
    fullscreen: true,
    backgroundColor: '#05070c',
    title: 'NEON DRIFT',
    webPreferences: { backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // F11 toggles fullscreen (Esc belongs to the game's menu).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
});
app.on('window-all-closed', () => app.quit());
