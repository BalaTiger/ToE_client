export const safeLS = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable in sandboxed runtimes.
    }
  },
};

export const LOCAL_DEBUG_KEY = 'cthulhu_local_debug_mode';
export const FIRST_BATTLE_DONE_KEY = 'cthulhu_first_battle_done_v1';

export const isH5PackagedRuntime = () => {
  if (typeof window === 'undefined') return false;
  try {
    if (window.__TOE_H5_PACKAGE__ === true || window.__TOE_H5_PACKAGE__ === '1') return true;
    if (typeof __TOE_H5_BUILD__ !== 'undefined' && __TOE_H5_BUILD__) return true;
    if (window.location?.protocol === 'file:') return true;
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
    if (window.navigator?.standalone === true) return true;
  } catch {
    // Ignore environment probing failures.
  }
  return false;
};

export const getRuntimeServerUrl = () => {
  if (typeof window === 'undefined') return '';
  const configured = window.__TOE_SERVER_URL__;
  if (configured) return configured;
  if (typeof __TOE_RUNTIME_TARGET__ !== 'undefined' && __TOE_RUNTIME_TARGET__ === 'dev') {
    return typeof __TOE_DEV_SERVER_URL__ !== 'undefined' ? __TOE_DEV_SERVER_URL__ : 'http://127.0.0.1:3002';
  }
  if (typeof __TOE_RUNTIME_TARGET__ !== 'undefined' && __TOE_RUNTIME_TARGET__ === 'h5') {
    return typeof __TOE_H5_SERVER_URL__ !== 'undefined' ? __TOE_H5_SERVER_URL__ : 'https://toegame.online';
  }
  if (typeof __TOE_RUNTIME_TARGET__ !== 'undefined' && __TOE_RUNTIME_TARGET__ === 'web') {
    if (typeof __TOE_WEB_SERVER_URL__ !== 'undefined' && __TOE_WEB_SERVER_URL__) return __TOE_WEB_SERVER_URL__;
  }
  const origin = window.location?.origin;
  if (!origin || origin === 'null') return 'http://127.0.0.1:3002';
  return origin;
};

export const getRuntimeSocketPath = () => {
  if (typeof window === 'undefined') return '/socket.io';
  if (window.__TOE_SOCKET_PATH__) return window.__TOE_SOCKET_PATH__;
  if (typeof __TOE_RUNTIME_TARGET__ !== 'undefined' && __TOE_RUNTIME_TARGET__ === 'dev') {
    return typeof __TOE_DEV_SOCKET_PATH__ !== 'undefined' ? __TOE_DEV_SOCKET_PATH__ : '/socket.io';
  }
  if (typeof __TOE_RUNTIME_TARGET__ !== 'undefined' && __TOE_RUNTIME_TARGET__ === 'h5') {
    return typeof __TOE_H5_SOCKET_PATH__ !== 'undefined' ? __TOE_H5_SOCKET_PATH__ : '/socket.io';
  }
  if (typeof __TOE_RUNTIME_TARGET__ !== 'undefined' && __TOE_RUNTIME_TARGET__ === 'web') {
    return typeof __TOE_WEB_SOCKET_PATH__ !== 'undefined' ? __TOE_WEB_SOCKET_PATH__ : '/socket.io';
  }
  if (window.location?.origin === 'null') return '/socket.io';
  return '/socket.io';
};

export const isLocalTestHost = () => {
  if (typeof window === 'undefined') return false;
  const host = (window.location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
};

export const isLocalDebugEnabled = () => {
  if (!isLocalTestHost()) return false;
  return safeLS.get(LOCAL_DEBUG_KEY) === '1';
};
