export const TORCH_FLAME_SOURCE = Object.freeze({
  url: '/img/effects/torch/flame-atlas.webp',
  stillUrl: '/img/effects/torch/flame-still.webp',
  columns: 8, rows: 6, frames: 48, fps: 24,
  frameWidth: 256, frameHeight: 512,
  // Authored emission reconstruction from the SDR atlas; this is not a
  // claim that an RGBA8 image contains the original simulation's HDR values.
  emissionGain: 3,
});

export function flameFrameAt(elapsedMs, { fps, frames }) {
  return Math.floor(Math.max(0, elapsedMs) * fps / 1000) % frames;
}

export function flameBackingSize(width, height, pixelRatio = 1, displayScale = 1, source = TORCH_FLAME_SOURCE) {
  const scale = Math.min(
    Math.max(.1, pixelRatio) * Math.max(.05, displayScale),
    source.frameWidth / Math.max(1, width),
    source.frameHeight / Math.max(1, height),
  );
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function canUseFlameHdr({ secure, gpu, highDynamicRange, enabled = true }) {
  return Boolean(enabled && secure && gpu && highDynamicRange);
}

export function flamePlaybackState({ hidden, paused, reducedMotion, visible = true, fullyCovered, intensity = 1 }) {
  return {
    animate: !hidden && !paused && !reducedMotion && visible && !fullyCovered,
    // Overlay content already composites above the flame. Its presence alone
    // must not dim areas outside the actual backdrop (e.g. a turn banner).
    opacity: Math.max(0, Math.min(1, intensity)),
  };
}

export function createSdrFlameRenderer(canvas, image, source) {
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('A 2D canvas context is unavailable');
  return {
    mode: 'sdr',
    draw(frame, opacity) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.globalAlpha = opacity;
      context.drawImage(image,
        frame % source.columns * source.frameWidth,
        Math.floor(frame / source.columns) * source.frameHeight,
        source.frameWidth, source.frameHeight, 0, 0, canvas.width, canvas.height);
    },
    destroy() {},
  };
}

const flameShader = /* wgsl */ `
struct Params { frame: f32, columns: f32, rows: f32, gain: f32, opacity: f32, _a: f32, _b: f32, _c: f32 };
@group(0) @binding(0) var atlas: texture_2d<f32>;
@group(0) @binding(1) var atlasSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let corners = array<vec2f, 6>(vec2f(-1., 1.), vec2f(-1., -1.), vec2f(1., 1.),
    vec2f(1., 1.), vec2f(-1., -1.), vec2f(1., -1.));
  var out: VertexOutput;
  out.position = vec4f(corners[index], 0., 1.);
  out.uv = (corners[index] * vec2f(1., -1.) + vec2f(1.)) * .5;
  return out;
}
fn linearRgb(encoded: vec3f) -> vec3f {
  return select(pow((encoded + vec3f(.055)) / 1.055, vec3f(2.4)), encoded / 12.92,
    encoded <= vec3f(.04045));
}
fn extendedSrgb(linear: vec3f) -> vec3f {
  let magnitude = abs(linear);
  return sign(linear) * select(1.055 * pow(magnitude, vec3f(1. / 2.4)) - vec3f(.055),
    magnitude * 12.92, magnitude <= vec3f(.0031308));
}
@fragment fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  let grid = vec2f(params.columns, params.rows);
  let cell = vec2f(params.frame % params.columns, floor(params.frame / params.columns));
  let halfTexel = .5 / vec2f(textureDimensions(atlas));
  let uv = clamp((cell + in.uv) / grid, cell / grid + halfTexel, (cell + vec2f(1.)) / grid - halfTexel);
  let sample = textureSample(atlas, atlasSampler, uv);
  let alpha = sample.a * params.opacity;
  // Keep low-intensity smoke/glow dim while allowing the flame core above
  // SDR white. A float texture does not imply a linear presentation encoding:
  // colorSpace:'srgb' expects extended sRGB, then encoded RGB is premultiplied.
  let linear = linearRgb(sample.rgb);
  let emissive = mix(1., params.gain, smoothstep(.12, .85, max(linear.r, max(linear.g, linear.b))));
  return vec4f(extendedSrgb(linear * emissive) * alpha, alpha);
}`;

export async function createHdrFlameRenderer(canvas, image, source, onLost) {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
  if (!adapter) throw new Error('No WebGPU adapter');
  const device = await adapter.requestDevice();
  let destroyed = false;
  let texture;
  let uniform;
  let bitmap;
  const context = canvas.getContext('webgpu');
  try {
    if (!context) throw new Error('No WebGPU canvas context');
    context.configure({ device, format: 'rgba16float', colorSpace: 'srgb',
      alphaMode: 'premultiplied', toneMapping: { mode: 'extended' } });
    if (context.getConfiguration?.()?.toneMapping?.mode !== 'extended') {
      throw new Error('Extended canvas tone mapping is unavailable');
    }
    const maxTexture = device.limits.maxTextureDimension2D;
    if (image.width > maxTexture || image.height > maxTexture) throw new Error('Flame atlas exceeds GPU limits');
    // Constants avoid requiring global WebGPU enums on the SDR path.
    texture = device.createTexture({ size: [image.width, image.height], format: 'rgba8unorm', usage: 2 | 4 | 16 });
    bitmap = await createImageBitmap(image, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    device.queue.copyExternalImageToTexture({ source: bitmap },
      { texture, premultipliedAlpha: false, colorSpace: 'srgb' }, [image.width, image.height]);
    bitmap.close(); bitmap = null;
    uniform = device.createBuffer({ size: 32, usage: 8 | 64 });
    device.pushErrorScope('validation');
    const shader = device.createShaderModule({ code: flameShader });
    const pipeline = await device.createRenderPipelineAsync({ layout: 'auto',
      vertex: { module: shader, entryPoint: 'vertexMain' },
      fragment: { module: shader, entryPoint: 'fragmentMain', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' } });
    const error = await device.popErrorScope();
    if (error) throw new Error(error.message);
    const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: texture.createView() },
      { binding: 1, resource: device.createSampler({ minFilter: 'linear', magFilter: 'linear' }) },
      { binding: 2, resource: { buffer: uniform } },
    ] });
    device.lost.then(() => { if (!destroyed) onLost(); });
    device.addEventListener('uncapturederror', () => { if (!destroyed) onLost(); });
    const params = new Float32Array(8);
    return {
      mode: 'hdr',
      draw(frame, opacity) {
        params.set([frame, source.columns, source.rows, source.emissionGain, opacity]);
        device.queue.writeBuffer(uniform, 0, params);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [{
          view: context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store',
        }] });
        pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.draw(6); pass.end();
        device.queue.submit([encoder.finish()]);
      },
      destroy() { destroyed = true; context.unconfigure(); texture.destroy(); uniform.destroy(); device.destroy(); },
    };
  } catch (error) {
    destroyed = true;
    bitmap?.close(); texture?.destroy(); uniform?.destroy(); context?.unconfigure(); device.destroy();
    throw error;
  }
}
