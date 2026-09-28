import coverageRegions from '../../constants/sailingWetRegions.json';

export const WET_REGIONS = ['main', 'early', 'tail'];
const percent = n => `${(n * 100).toFixed(3)}%`;
const front = position => `0% 0%, 0% 0%, 0% 0%, ${position}`;
const fullFront = front('100% 100%');
const ellipse = (area, scale = 1) => `ellipse(${percent(area.rx * scale)} ${percent(area.ry * scale)} at ${percent(area.x)} ${percent(area.y)})`;
const areaMask = (area, inverse = false) => `radial-gradient(ellipse ${percent(area.rx)} ${percent(area.ry)} at ${percent(area.x)} ${percent(area.y)}, ${inverse ? 'transparent' : '#000'} 70%, ${inverse ? '#000' : 'transparent'} 100%)`;

// E(1-L) + L + (1-E)(1-L) = 1. Multiplying each by the common footprint
// prevents duplicate wet artwork from adding brighter or larger coverage.
function masks(path, areas) {
  const coverage = `url('${path}')`;
  // Raised surfaces catch water from the lower-right sea: screen Y decreases
  // as the splash rises. Foreground/depth travel is not downward wetting.
  const incoming = 'linear-gradient(298deg, #000 46%, transparent 54%)';
  return [
    `${coverage}, ${areaMask(areas.early, true)}, ${areaMask(areas.tail, true)}, ${incoming}`,
    `${coverage}, ${areaMask(areas.early)}, ${areaMask(areas.tail, true)}, ${incoming}`,
    `${coverage}, linear-gradient(#000, #000), ${areaMask(areas.tail)}, ${incoming}`,
  ];
}

export function staticWetRegions(surface, path, variant = 0) {
  const areas = coverageRegions.variants[variant][surface];
  return masks(path, areas).map((maskImage, index) => ({
    maskImage, maskPosition: fullFront,
    clipPath: ellipse(index ? areas[WET_REGIONS[index]] : { x: areas.impact[0], y: areas.impact[1], rx: 1.5, ry: 1.1 }),
  }));
}

export function createWetPlan(surface, paths, previousMask = '', random = Math.random) {
  const between = (low, high) => low + (high - low) * random();
  const available = paths.map((path, variant) => ({ path, variant })).filter(({ path }) => !previousMask.includes(path));
  const regions = WET_REGIONS.map(name => ({ name, frames: [], windows: [] }));
  for (let wave = 0; wave < 3; wave++) {
    const { path, variant } = available.splice(Math.floor(random() * available.length), 1)[0];
    const base = coverageRegions.variants[variant][surface];
    // Small anchor jitter within the validated material; never move the image.
    const jitter = area => ({ ...area, x: area.x + between(-.008, .008), y: area.y + between(-.006, .006) });
    const areas = { early: jitter(base.early), tail: jitter(base.tail) };
    const images = masks(path, areas);
    const start = wave * 920;
    const lag = surface === 'panel' ? 18.4 : 0;
    // A central pre-hit is likely, not mandatory; other waves can hit the
    // incoming edge or tail first instead of repeating a fixed spatial order.
    const prehit = random() < .65;
    const arrivals = [between(375, 410), prehit ? between(260, 310) : between(425, 480), between(350, 435)];
    regions.forEach((region, index) => {
      const area = index ? areas[region.name] : { x: base.impact[0], y: base.impact[1], rx: 1.5, ry: 1.1 };
      const openClip = ellipse(area), closedClip = ellipse(area, 0);
      const arrive = start + arrivals[index] + lag;
      const spread = index === 0 ? 184 : between(55, 90);
      const dryStart = arrive + spread + between(25, 55);
      const dryEnd = wave < 2 ? start + (index === 0 ? between(840, 890) : index === 1 ? (prehit ? between(660, 715) : between(735, 775)) : between(780, 835))
        : dryStart + (index === 0 ? between(1400, 2200) : index === 1 ? between(300, 520) : between(680, 1050));
      const peak = index === 0 ? .8 : index === 1 ? between(.63, .74) : between(.68, .78);
      const maskImage = images[index];
      const entry = (time, opacity, clipPath, maskPosition = fullFront) => ({ time, opacity, clipPath, maskPosition, maskImage });
      region.frames.push(
        entry(start, 0, index ? closedClip : openClip, index ? fullFront : front('0% 0%')),
        entry(arrive, 0, index ? closedClip : openClip, index ? fullFront : front('20% 20%')),
        entry(arrive + spread * .45, peak * .92, index ? ellipse(area, .8) : openClip, index ? fullFront : front('58% 58%')),
        entry(arrive + spread, peak, openClip),
        entry(dryStart, peak, openClip),
        entry(dryStart + (dryEnd - dryStart) * .45, peak * .66, ellipse(area, .72)),
        entry(dryEnd, 0, closedClip),
      );
      if (wave < 2) region.frames.push(entry(start + 910, 0, closedClip));
      region.windows.push({ start, arrive, dryStart, dryEnd, dryDuration: dryEnd - dryStart, closedClip });
    });
  }
  const duration = Math.max(...regions.map(region => region.windows.at(-1).dryEnd));
  regions.forEach(region => {
    region.frames.push({ ...region.frames.at(-1), time: duration });
    region.frames = region.frames.map(({ time, ...frame }) => ({ ...frame, offset: time / duration }));
  });
  return { duration, regions };
}

// An interrupted drying patch keeps its remaining life. Unhit/already-dry
// patches are skipped by the caller; they must never become wet on exit.
export function remainingWetDrying(run, time = 0) {
  const window = run?.windows?.findLast(part => part.start <= time);
  if (!window) return { duration: 600, closedClip: 'ellipse(0% 0% at 50% 50%)' };
  return { duration: Math.max(1, time >= window.dryStart ? window.dryEnd - time : window.dryDuration), closedClip: window.closedClip };
}
