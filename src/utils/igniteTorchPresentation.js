function escapeDomSelectorValue(value) {
  const raw = String(value ?? '');
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(raw);
  return raw.replace(/["\\]/g, '\\$&');
}

export function playIgniteTorchCardFlameEffect(card, { playFireSound } = {}) {
  if (!card?.id || typeof document === 'undefined') return Promise.resolve(false);
  const selector = `[data-self-hand-card-id="${escapeDomSelectorValue(card.id)}"]`;
  const element = document.querySelector(selector);
  if (!element) return Promise.resolve(false);
  const durationMs = 760;
  const wrapperRect = element.getBoundingClientRect();
  element.querySelectorAll('.ignite-torch-flame-layer,.ignite-torch-ember-layer')
    .forEach(node => node.remove());
  const visualCardElement = Array.from(element.children).find(node => (
    node instanceof HTMLElement
    && !node.classList.contains('ignite-torch-flame-layer')
    && !node.classList.contains('ignite-torch-ember-layer')
  )) || element;
  const rect = visualCardElement.getBoundingClientRect();
  const flameLayer = document.createElement('div');
  flameLayer.className = 'ignite-torch-flame-layer';
  flameLayer.setAttribute('aria-hidden', 'true');
  const cardHeight = Math.max(1, rect.height);
  const cardWidth = Math.max(1, rect.width);
  const flameHeight = Math.round(cardWidth * 0.6);
  const emberRise = Math.max(1, Math.round(cardHeight * 0.86));
  const flameLeft = rect.left - wrapperRect.left;
  const flameTop = rect.bottom - wrapperRect.top - flameHeight;
  const emberPad = 34;
  const emberHeight = cardHeight + 82;
  flameLayer.style.setProperty('--ignite-card-h', `${cardHeight}px`);
  flameLayer.style.setProperty('--ignite-flame-h', `${flameHeight}px`);
  flameLayer.style.setProperty('--ignite-flame-left', `${flameLeft}px`);
  flameLayer.style.setProperty('--ignite-flame-top', `${flameTop}px`);
  flameLayer.style.setProperty('--ignite-flame-w', `${cardWidth}px`);
  flameLayer.style.setProperty('--ignite-card-rise', `${cardHeight * -1}px`);
  const emberLayer = document.createElement('div');
  emberLayer.className = 'ignite-torch-ember-layer';
  emberLayer.setAttribute('aria-hidden', 'true');
  emberLayer.style.setProperty('--ignite-card-h', `${cardHeight}px`);
  emberLayer.style.setProperty('--ignite-ember-left', `${flameLeft - emberPad}px`);
  emberLayer.style.setProperty('--ignite-ember-top', `${rect.bottom - wrapperRect.top - emberHeight}px`);
  emberLayer.style.setProperty('--ignite-ember-w', `${Math.max(1, cardWidth + emberPad * 2)}px`);
  emberLayer.style.setProperty('--ignite-ember-h', `${emberHeight}px`);
  emberLayer.style.setProperty('--ignite-ember-mid-rise', `${Math.round(emberRise * -0.42)}px`);
  emberLayer.style.setProperty('--ignite-ember-rise', `${emberRise * -1}px`);
  element.appendChild(flameLayer);
  element.appendChild(emberLayer);
  element.setAttribute('data-ignite-torch-flame', 'true');
  const stopFireSound = playFireSound?.({ durationMs });
  return new Promise(resolve => {
    const cleanup = () => {
      stopFireSound?.();
      flameLayer.remove();
      emberLayer.remove();
      element.removeAttribute('data-ignite-torch-flame');
      resolve(true);
    };
    window.setTimeout(cleanup, durationMs);
  });
}
