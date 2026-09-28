import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyGameGamma, GAME_LAYER_IDS, getGameLayerTarget, mountGameLayers, renderGameLayer, subscribeOverlayPresence } from './gameLayers';
import { AnimOverlay } from '../components/anim/AnimOverlay';

function makeDocument() {
  const nodes = new Map();
  const element = (tagName = 'div') => {
    const node = {
      nodeType: 1, tagName: tagName.toUpperCase(), children: [], dataset: {}, parentNode: null,
      style: { setProperty: vi.fn() },
      setAttribute: vi.fn(),
      appendChild(child) {
        if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(item => item !== child);
        child.parentNode = this;
        this.children.push(child);
        if (child.id) nodes.set(child.id, child);
      },
    };
    return node;
  };
  const doc = { body: element('body'), documentElement: element('html'), createElement: element, getElementById: id => nodes.get(id) };
  const app = element();
  app.id = 'root';
  doc.body.appendChild(app);
  return doc;
}

afterEach(() => vi.unstubAllGlobals());

describe('independent scene / flame / overlay composition', () => {
  it('mounts sibling viewport hosts once and keeps the app in the filtered scene', () => {
    const doc = makeDocument();
    mountGameLayers(doc);
    mountGameLayers(doc);
    expect(doc.body.children.map(node => node.id)).toEqual(Object.values(GAME_LAYER_IDS));
    expect(doc.getElementById('root').parentNode).toBe(doc.getElementById(GAME_LAYER_IDS.scene));
    expect(doc.getElementById(GAME_LAYER_IDS.flame).children).toEqual([]);
    expect(doc.getElementById(GAME_LAYER_IDS.overlay).parentNode).toBe(doc.body);
    const css = readFileSync(new URL('./game-layers.css', import.meta.url), 'utf8');
    const block = layer => css.match(new RegExp(`\\[data-game-layer='${layer}'\\] \\{([^}]+)\\}`))[1];
    expect(block('scene')).toContain('z-index: 1');
    expect(block('flame')).toContain('z-index: 2');
    expect(block('overlay')).toContain('z-index: 3');
    expect(block('scene')).toContain('filter: var(--toe-scene-gamma, none)');
    expect(block('overlay')).toContain('filter: var(--toe-scene-gamma, none)');
    expect(block('flame')).not.toContain('filter:');
  });

  it('removes the body filter instead of attempting an inverse on the flame', () => {
    const doc = makeDocument();
    doc.body.style.filter = 'brightness(2)';
    applyGameGamma('brightness(1.50) contrast(1.15)', doc);
    expect(doc.body.style.filter).toBe('');
    expect(doc.documentElement.style.setProperty).toHaveBeenLastCalledWith('--toe-scene-gamma', 'brightness(1.50) contrast(1.15)');
    applyGameGamma('', doc);
    expect(doc.documentElement.style.setProperty).toHaveBeenLastCalledWith('--toe-scene-gamma', 'none');
  });

  it('portals into this document and preserves static rendering when hosts are absent', () => {
    const content = createElement('button', null, '确认');
    expect(renderGameLayer(content)).toBe(content);
    const doc = makeDocument();
    vi.stubGlobal('document', doc);
    mountGameLayers(doc);
    const portal = renderGameLayer(content);
    expect(portal.containerInfo).toBe(doc.getElementById(GAME_LAYER_IDS.overlay));
    expect(portal.children).toBe(content);
    expect(getGameLayerTarget('flame')).toBe(doc.getElementById(GAME_LAYER_IDS.flame));
  });

  it('reports real overlay content, excluding stylesheet nodes, and disconnects observation', () => {
    const doc = makeDocument();
    vi.stubGlobal('document', doc);
    mountGameLayers(doc);
    let notify;
    const disconnect = vi.fn();
    vi.stubGlobal('MutationObserver', class {
      constructor(callback) { notify = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    const onChange = vi.fn();
    const stop = subscribeOverlayPresence(onChange);
    expect(onChange).toHaveBeenLastCalledWith(false);
    const host = doc.getElementById(GAME_LAYER_IDS.overlay);
    host.children.push(doc.createElement('style'));
    notify();
    expect(onChange).toHaveBeenLastCalledWith(false);
    host.children.push(doc.createElement('div'));
    notify();
    expect(onChange).toHaveBeenLastCalledWith(true);
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('keeps ordinary card travel below flame and moves full-screen playback above it', () => {
    const doc = makeDocument();
    vi.stubGlobal('document', doc);
    mountGameLayers(doc);
    for (const type of ['DRAW_CARD', 'DISCARD', 'BURY_TO_DECK', 'ZHU_HIDE_CARD']) {
      expect(AnimOverlay({ anim: { type, card: { name: '测试牌' } } }).containerInfo).toBeUndefined();
    }
    for (const type of ['DICE_ROLL', 'APOPHIS_ECLIPSE', 'ENDLESS_CORRIDOR_TUNNEL']) {
      expect(AnimOverlay({ anim: { type } }).containerInfo).toBe(doc.getElementById(GAME_LAYER_IDS.overlay));
    }
  });
});
