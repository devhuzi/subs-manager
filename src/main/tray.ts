import { app, Menu, Tray, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

const iconPath = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'build', 'tray-icon.png')
    : join(__dirname, '..', '..', 'build', 'tray-icon.png');

export interface TrayCallbacks {
  /** Show (recreating if needed) the current main window. Looked up on each
   * click rather than captured, since the window can be closed and rebuilt. */
  onShow: () => void;
  onCheckNow: () => Promise<{ fired: number }> | { fired: number };
}

export const createTray = (cb: TrayCallbacks): Tray => {
  let image = nativeImage.createFromPath(iconPath());
  if (process.platform === 'darwin') {
    // The macOS menu bar expects a 16pt monochrome template image; a larger
    // PNG renders oversized and doesn't adapt to light/dark menu bars.
    image = image.resize({ width: 16, height: 16 });
    image.setTemplateImage(true);
  }
  tray = new Tray(image);
  tray.setToolTip('Tools & Subs Manager');

  const menu = Menu.buildFromTemplate([
    { label: 'Open Tools & Subs Manager', click: () => cb.onShow() },
    {
      label: 'Check renewals now',
      click: async () => {
        await cb.onCheckNow();
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => cb.onShow());
  return tray;
};

export const destroyTray = (): void => {
  tray?.destroy();
  tray = null;
};
