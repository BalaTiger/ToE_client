import { buildPublicUrl } from '../../utils/url';

export const DEFAULT_EFFECT_NOISE_TEXTURE = '/img/effects/noise/effect_noise_flow_256.png';

const imageCache = new Map();
const noiseTextureCache = new Map();

function toPublicUrl(src) {
  const text = String(src);
  if (/^(?:https?:|data:|blob:)/.test(text)) return text;
  return buildPublicUrl(text);
}

function wrap01(value) {
  return value - Math.floor(value);
}

function hashSeed(seed) {
  const text = String(seed ?? '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFromSeed(seed) {
  let state = typeof seed === 'number' && Number.isFinite(seed)
    ? seed >>> 0
    : hashSeed(seed);
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

export function createEffectNoiseOrigin(seed = Math.random()) {
  if (seed && typeof seed === 'object') {
    return {
      x: wrap01(Number(seed.x) || 0),
      y: wrap01(Number(seed.y) || 0),
    };
  }
  const random = randomFromSeed(seed);
  return {
    x: random(),
    y: random(),
  };
}

export function loadEffectImage(src) {
  const url = toPublicUrl(src);
  if (!imageCache.has(url)) {
    imageCache.set(url, new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load effect image: ${url}`));
      image.src = url;
    }));
  }
  return imageCache.get(url);
}

export async function loadEffectNoiseTexture(src = DEFAULT_EFFECT_NOISE_TEXTURE) {
  const url = toPublicUrl(src);
  if (!noiseTextureCache.has(url)) {
    noiseTextureCache.set(url, loadEffectImage(src).then((image) => {
      const canvas = document.createElement('canvas');
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, width, height);
      return {
        image,
        width,
        height,
        data: ctx.getImageData(0, 0, width, height).data,
      };
    }));
  }
  return noiseTextureCache.get(url);
}

function readNoisePixel(texture, x, y) {
  const px = ((y % texture.height) * texture.width + (x % texture.width)) * 4;
  return {
    r: texture.data[px] / 255,
    g: texture.data[px + 1] / 255,
    b: texture.data[px + 2] / 255,
    a: texture.data[px + 3] / 255,
  };
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function sampleBilinear(texture, u, v) {
  const x = wrap01(u) * texture.width;
  const y = wrap01(v) * texture.height;
  const x0 = Math.floor(x) % texture.width;
  const y0 = Math.floor(y) % texture.height;
  const x1 = (x0 + 1) % texture.width;
  const y1 = (y0 + 1) % texture.height;
  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);
  const p00 = readNoisePixel(texture, x0, y0);
  const p10 = readNoisePixel(texture, x1, y0);
  const p01 = readNoisePixel(texture, x0, y1);
  const p11 = readNoisePixel(texture, x1, y1);

  return {
    r: mix(mix(p00.r, p10.r, tx), mix(p01.r, p11.r, tx), ty),
    g: mix(mix(p00.g, p10.g, tx), mix(p01.g, p11.g, tx), ty),
    b: mix(mix(p00.b, p10.b, tx), mix(p01.b, p11.b, tx), ty),
    a: mix(mix(p00.a, p10.a, tx), mix(p01.a, p11.a, tx), ty),
  };
}

export function createEffectNoiseSampler(texture, options = {}) {
  const {
    origin = createEffectNoiseOrigin(),
    scale = 1,
    velocity = { x: 0.04, y: -0.025 },
  } = options;
  const sampleOrigin = createEffectNoiseOrigin(origin);

  return {
    origin: sampleOrigin,
    sample(u, v, time = 0) {
      return sampleBilinear(
        texture,
        sampleOrigin.x + u * scale + velocity.x * time,
        sampleOrigin.y + v * scale + velocity.y * time,
      );
    },
    sampleVector(u, v, time = 0) {
      const px = this.sample(u, v, time);
      return {
        x: px.r * 2 - 1,
        y: px.g * 2 - 1,
        value: px.b * 2 - 1,
        alpha: px.a,
      };
    },
  };
}

function getCoverSourceRect(image, width, height) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const imageRatio = imageWidth / imageHeight;
  const targetRatio = width / height;
  if (imageRatio > targetRatio) {
    const sourceWidth = imageHeight * targetRatio;
    return {
      x: (imageWidth - sourceWidth) / 2,
      y: 0,
      width: sourceWidth,
      height: imageHeight,
    };
  }
  const sourceHeight = imageWidth / targetRatio;
  return {
    x: 0,
    y: (imageHeight - sourceHeight) / 2,
    width: imageWidth,
    height: sourceHeight,
  };
}

export function drawNoiseDisplacedCoverImage(ctx, image, sampler, width, height, time = 0, options = {}) {
  const {
    x = 0,
    y = 0,
    cols = 18,
    rows = 14,
    strength = Math.min(width, height) * 0.018,
    baseAlpha = 0.34,
    displacedAlpha = 0.9,
    overlap = 1.5,
  } = options;
  const source = getCoverSourceRect(image, width, height);
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const sourceCellWidth = source.width / cols;
  const sourceCellHeight = source.height / rows;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (baseAlpha > 0) {
    ctx.globalAlpha = baseAlpha;
    ctx.drawImage(image, source.x, source.y, source.width, source.height, x, y, width, height);
  }

  ctx.globalAlpha = displacedAlpha;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const u = (col + 0.5) / cols;
      const v = (row + 0.5) / rows;
      const noise = sampler.sampleVector(u, v, time);
      const flow = sampler.sampleVector(u * 1.9 + 0.17, v * 1.55 - 0.11, time * 0.63);
      const wave = Math.sin((v * 3.4 + time * 0.54) * Math.PI * 2 + noise.value * 1.8);
      const offsetX = (noise.x * 0.72 + flow.x * 0.28 + wave * 0.16) * strength;
      const offsetY = (noise.y * 0.66 + flow.y * 0.24) * strength * 0.72;

      ctx.drawImage(
        image,
        source.x + col * sourceCellWidth,
        source.y + row * sourceCellHeight,
        sourceCellWidth,
        sourceCellHeight,
        x + col * cellWidth + offsetX - overlap,
        y + row * cellHeight + offsetY - overlap,
        cellWidth + overlap * 2,
        cellHeight + overlap * 2,
      );
    }
  }
  ctx.restore();
}
