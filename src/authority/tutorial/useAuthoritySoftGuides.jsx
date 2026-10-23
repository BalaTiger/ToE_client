import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createSoftGuideController } from './softGuideController';
import { SOFT_GUIDE_DEFS } from '../../game/softGuides';
import SoftGuideOverlay from '../../components/tutorial/SoftGuideOverlay';
import { _getZoomCompensatedRect } from '../../utils/dom';

export function useAuthoritySoftGuides({ session, view, offline, busy, refs }) {
  const controller = useMemo(() => {
    let storage; try { storage = window.localStorage; } catch { /* Optional preference. */ }
    return createSoftGuideController(session, storage);
  }, [session]);
  const active = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [spotlights, setSpotlights] = useState([]);
  useEffect(() => { controller.update(view, { offline, busy }); }, [controller, view, offline, busy]);
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    if (!active) return;
    const measure = () => {
      const elements = active === 'rest' ? [refs.selfPanelRef.current?.querySelector('[data-stat-label="HP"]'), refs.restButtonRef.current]
        : [...document.querySelectorAll('[data-resting-marker]')];
      setSpotlights(elements.filter(Boolean).map((element, index) => ({ id: index, rect: _getZoomCompensatedRect(element) }))
        .filter(item => item.rect?.width > 0 && item.rect?.height > 0));
    };
    measure(); window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [active, refs]);
  return { active, overlay: active && <SoftGuideOverlay guide={SOFT_GUIDE_DEFS[active]} spotlights={spotlights}
    onClose={() => controller.close()} /> };
}
