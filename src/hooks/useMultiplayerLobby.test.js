import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMultiplayerIdentityStorage } from './useMultiplayerLobby';

function stubWindowForHost(hostname) {
  const sessionStorage = { kind: 'session' };
  const localStorage = { kind: 'local' };
  vi.stubGlobal('window', {
    location: { hostname },
    sessionStorage,
    localStorage,
  });
  return { sessionStorage, localStorage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMultiplayerIdentityStorage', () => {
  it('uses session storage on local development hosts', () => {
    const { sessionStorage } = stubWindowForHost('localhost');

    expect(getMultiplayerIdentityStorage()).toBe(sessionStorage);
  });

  it('uses local storage on regular hosts', () => {
    const { localStorage } = stubWindowForHost('www.toegame.online');

    expect(getMultiplayerIdentityStorage()).toBe(localStorage);
  });

  it('no longer treats Trae preview hosts as local development hosts', () => {
    const { localStorage } = stubWindowForHost('preview.trae.ai');

    expect(getMultiplayerIdentityStorage()).toBe(localStorage);
  });
});
