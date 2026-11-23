'use strict';

const { contextBridge } = require('electron');
const prefix = '--liveforge-share-origin=';
const shareOrigin = process.argv.find(argument => argument.startsWith(prefix)).slice(prefix.length);

contextBridge.exposeInMainWorld('liveForgeDesktop', Object.freeze({ shareOrigin }));
