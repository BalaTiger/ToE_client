import { buildPublicUrl } from '../../utils/url';
import './sailing-spray.css';

// Traced from the alpha edge of foreground-torch.webp (1536 × 1024).
// The two sides differ; the right branch stops before the rising tentacle.
const EDGE_BRANCHES = [
  { side: -1, points: [[.50, .870], [.40, .877], [.25, .887], [.10, .871]] },
  { side: 1, points: [[.50, .870], [.61, .893], [.73, .885], [.85, .831]] },
];

export function SailingSpray({ active = false, paused = false, width = 1200, height = 620 }) {
  const plumeWidth = Math.min(420, width * .285);
  // Independent siblings are essential: the wake is behind the foreground,
  // while only the small foam tips may cross the hand's lower edge.
  return <>{['wake', 'crest'].map(layer => <div key={layer}
    className={`toe-sailing-spray toe-sailing-${layer}`} data-active={active} data-paused={paused} aria-hidden="true">
    {EDGE_BRANCHES.map(({ side, points }) => <div className="toe-sailing-rider" key={side} style={{
      offsetPath: `path('M ${points.map(([x, y], index) => `${index === 1 ? 'C ' : ''}${(x * width).toFixed(2)} ${(y * height).toFixed(2)}`).join(' ')}')`,
      '--sailing-side': side, '--sailing-plume-width': `${plumeWidth}px`,
    }}>
      <div className="toe-sailing-wing">
        {layer === 'wake'
          ? <img className="toe-sailing-plume" src={buildPublicUrl('/img/effects/sailing/bow-splash.webp')} alt="" width="768" height="512" />
          : <img className="toe-sailing-foam" src={buildPublicUrl('/img/effects/sailing/kenney-foam-particles.png')} alt="" width="512" height="512" />}
      </div>
    </div>)}
  </div>)}</>;
}

// The few droplets that cross the shaft live inside the torch's existing
// stacking context. They cannot rise above the cards, HDR flame, or dialogs.
export function SailingTorchMist({ active = false, paused = false }) {
  return <div className="toe-sailing-torch-mist" data-active={active} data-paused={paused} aria-hidden="true">
    {[0, 1, 2].map(index => <img key={index} src={buildPublicUrl('/img/effects/sailing/kenney-droplet-soft.png')}
      alt="" width="512" height="512" style={{
        '--spray-delay': `${index * 28}ms`, '--spray-x': `${-42 - index * 17}px`,
        '--spray-y': `${-36 - index * 18}px`, '--spray-size': `${3 + index}px`,
      }} />)}
  </div>;
}
