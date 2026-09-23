import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AiChatRequest,
  AiStreamChunk,
  AppData,
  FileFilter,
  IpcApi,
} from '../shared/types';

const api: IpcApi = {
  getDataDir: () => ipcRenderer.invoke('data:getDir'),
  chooseDataDir: () => ipcRenderer.invoke('data:chooseDir'),
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data: AppData) => ipcRenderer.invoke('data:save', data),
  saveFile: (defaultName: string, content: string, filters: FileFilter[]) =>
    ipcRenderer.invoke('data:saveFile', defaultName, content, filters),
  openFile: (filters: FileFilter[]) => ipcRenderer.invoke('data:openFile', filters),
  openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
  checkRemindersNow: () => ipcRenderer.invoke('system:checkRemindersNow'),
  getRates: () => ipcRenderer.invoke('fx:getRates'),
  refreshRates: () => ipcRenderer.invoke('fx:refreshRates'),
  fetchLogo: (website: string) => ipcRenderer.invoke('logo:fetch', website),
  aiChat: (request: AiChatRequest) => ipcRenderer.invoke('ai:chat', request),
  aiSetKey: (key: string) => ipcRenderer.invoke('ai:setKey', key),
  aiClearKey: () => ipcRenderer.invoke('ai:clearKey'),
  aiHasKey: () => ipcRenderer.invoke('ai:hasKey'),
  aiIsSecureStorageAvailable: () => ipcRenderer.invoke('ai:isSecureStorageAvailable'),
  aiFetchModelPricing: () => ipcRenderer.invoke('ai:fetchModelPricing'),
  backupNow: () => ipcRenderer.invoke('backup:now'),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  openBackupsFolder: () => ipcRenderer.invoke('backup:openFolder'),
  onAiChunk: (cb: (chunk: AiStreamChunk) => void) => {
    const listener = (_e: IpcRendererEvent, chunk: AiStreamChunk): void => cb(chunk);
    ipcRenderer.on('ai:chunk', listener);
    return () => {
      ipcRenderer.removeListener('ai:chunk', listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
