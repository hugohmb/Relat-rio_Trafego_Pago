'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('automacaoDesktop', Object.freeze({
    ambiente: 'electron',
    versao: '3.0.0',
    obterStatus: () => ipcRenderer.invoke('desktop:status'),
    abrirPasta: nome => ipcRenderer.invoke('desktop:abrir-pasta', nome),
    importarDadosPortateis: () => ipcRenderer.invoke('desktop:importar-portatil'),
    criarBackupBanco: () => ipcRenderer.invoke('desktop:backup-banco'),
    aoAbrirConfiguracaoGemini: callback => {
        if (typeof callback !== 'function') return () => {};
        const listener = () => callback();
        ipcRenderer.on('desktop:abrir-configuracao-gemini', listener);
        return () => ipcRenderer.removeListener('desktop:abrir-configuracao-gemini', listener);
    }
}));
