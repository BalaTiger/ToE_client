import { renderGameLayer } from './gameLayers';

export function GameLayerPortal({ layer = 'overlay', children }) {
  return renderGameLayer(children, layer);
}
