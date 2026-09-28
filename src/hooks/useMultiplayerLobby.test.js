import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMultiplayerIdentityStorage,
  getStoredMultiplayerIdentity,
} from './useMultiplayerLobby';

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

describe('getStoredMultiplayerIdentity', () => {
  it('loads the uuid and signed identity token together', () => {
    const values = new Map([
      ['cthulhu_player_uuid', 'u1'],
      ['cthulhu_identity_token', 'token-1'],
    ]);
    vi.stubGlobal('window', {
      location: { hostname: 'www.toegame.online' },
      sessionStorage: {},
      localStorage: { getItem: key => values.get(key) ?? null },
    });

    expect(getStoredMultiplayerIdentity()).toEqual({
      uuid: 'u1',
      identityToken: 'token-1',
    });
  });
});
