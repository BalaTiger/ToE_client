import { buildPublicUrl } from '../../utils/url';

export const CARD_FACE_WIDTH = 392;
export const CARD_FACE_HEIGHT = 590;
export const CARD_FACE_RATIO = CARD_FACE_HEIGHT / CARD_FACE_WIDTH;

export const CARD_FACE_BACKGROUND_FILES = [
  '/img/card/cardbg_zone.png',
  '/img/card/cardbg_god.png',
];

const CARD_FACE_META_BY_ID = {
  zone: {
    swallowFluorescentMosses: {
      match: card => card?.type === 'selfRevealHandHP' || card?.name === '吃下荧光苔藓',
      illustration: '/img/card/illustration/swallow_fluorescent_mosses.png',
      flavor: '“看什么看，没见过发光的人吗？”',
    },
  },
  god: {
    NYA: {
      illustration: '/img/card/illustration/nya.png',
      flavor: '“我的美少女外观？已经在做了，我骗过你吗？”',
    },
  },
};

export const CARD_FACE_ILLUSTRATION_FILES = [
  ...Object.values(CARD_FACE_META_BY_ID.zone).map(meta => meta.illustration),
  ...Object.values(CARD_FACE_META_BY_ID.god).map(meta => meta.illustration),
].filter(Boolean);

const decodedIllustrations = new Set();
const pendingIllustrations = new Map();
let idleDownloadScheduled = false;

function runWhenIdle(task) {
  if (typeof window === 'undefined') return;
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 3000 });
    return;
  }
  window.setTimeout(task, 0);
}

export function getCardFaceMeta(card) {
  if (card?.isGod) return CARD_FACE_META_BY_ID.god[card?.godKey] || null;
  return Object.values(CARD_FACE_META_BY_ID.zone).find(meta => meta.match(card)) || null;
}

export function isCardIllustrationReady(path) {
  return !!path && typeof window !== 'undefined' && decodedIllustrations.has(buildPublicUrl(path));
}

export function loadCardIllustration(path) {
  if (!path || typeof window === 'undefined') return Promise.resolve(false);
  const url = buildPublicUrl(path);
  if (decodedIllustrations.has(url)) return Promise.resolve(true);
  if (pendingIllustrations.has(url)) return pendingIllustrations.get(url);
  const promise = new Promise(resolve => {
    const img = new Image();
    img.onload = async () => {
      try {
        if (img.decode) await img.decode();
      } catch {
        // The image can still be painted if decode rejects after load.
      }
      decodedIllustrations.add(url);
      pendingIllustrations.delete(url);
      resolve(true);
    };
    img.onerror = () => {
      pendingIllustrations.delete(url);
      resolve(false);
    };
    img.src = url;
  });
  pendingIllustrations.set(url, promise);
  return promise;
}

export function scheduleCardIllustrationIdleDownload(paths = CARD_FACE_ILLUSTRATION_FILES) {
  if (idleDownloadScheduled || typeof window === 'undefined') return;
  idleDownloadScheduled = true;
  runWhenIdle(async () => {
    for (const path of paths) {
      await loadCardIllustration(path);
    }
  });
}
