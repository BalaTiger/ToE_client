import { persistPreference } from '../hooks/useGamePreferences';
import { buildPublicUrl } from '../utils/url';

export const UI_APPEARANCE_KEY = 'toe_ui_appearance';

const sharedAssets = {
  panelSurface: '/img/ui/interface/panel-surface.webp',
  panelFrame: '/img/ui/interface/panel-frame.webp',
  reliefLeft: '/img/ui/hand-table/relief-left.webp',
  reliefRight: '/img/ui/hand-table/relief-right.webp',
  skill: '/img/ui/hand-table/skill.webp',
  rest: '/img/ui/hand-table/rest.webp',
  multiply: '/img/ui/hand-table/multiply.webp',
  end: '/img/ui/hand-table/end.webp',
};

// UI composition is a local preference, independent of expansion rules/themes.
export const UI_APPEARANCES = [
  {
    id: 'arcane-table',
    label: '弧形桌台',
    battleLayout: 'arch',
    assets: { ...sharedAssets, handTable: '/img/ui/hand-table/table-weathered.webp' },
    cssVariables: { '--toe-ui-accent': '#c3a374', '--toe-ui-line': '#65563d' },
  },
  {
    id: 'classic',
    label: '经典布局',
    battleLayout: 'grid',
    assets: { ...sharedAssets, handTable: '/img/ui/hand-table/table.webp' },
    cssVariables: { '--toe-ui-accent': '#c3a374', '--toe-ui-line': '#65563d' },
  },
  {
    id: 'coastal',
    label: '3号 · 遗迹海岸',
    battleLayout: 'coastal',
    assets: {
      ...sharedAssets,
      handTable: '/img/ui/hand-table/table-weathered.webp',
      skill: '/img/ui/coastal/action-skill.webp',
      rest: '/img/ui/coastal/action-rest.webp',
      multiply: '/img/ui/coastal/action-multiply.webp',
      end: '/img/ui/coastal/action-end.webp',
    },
    cssVariables: { '--toe-ui-accent': '#b5a383', '--toe-ui-line': '#5c5141' },
  },
];

export function resolveUiAppearance(id) {
  return UI_APPEARANCES.find(appearance => appearance.id === id) ?? UI_APPEARANCES[0];
}

export function readUiAppearance(storage, search = '') {
  const preview = new URLSearchParams(search).get('ui-appearance');
  if (preview !== null) return resolveUiAppearance(preview);
  try {
    return resolveUiAppearance(storage?.getItem(UI_APPEARANCE_KEY));
  } catch {
    return UI_APPEARANCES[0];
  }
}

export function selectUiAppearance(id, storage) {
  const appearance = resolveUiAppearance(id);
  persistPreference(storage, UI_APPEARANCE_KEY, appearance.id);
  return appearance;
}

const assetVariables = {
  panelSurface: '--toe-ui-surface-image',
  panelFrame: '--toe-ui-frame-image',
  skill: '--toe-action-skill-image',
  rest: '--toe-action-rest-image',
  multiply: '--toe-action-multiply-image',
  end: '--toe-action-end-image',
};

export function applyUiAppearance(appearance, root) {
  const previousId = root.getAttribute('data-ui-appearance');
  const previousLayout = root.getAttribute('data-ui-layout');
  const variables = { ...appearance.cssVariables };
  for (const [asset, variable] of Object.entries(assetVariables)) {
    if (appearance.assets[asset]) variables[variable] = `url('${buildPublicUrl(appearance.assets[asset])}')`;
  }
  const previous = Object.keys(variables).map(name => [name, root.style.getPropertyValue(name)]);
  root.setAttribute('data-ui-appearance', appearance.id);
  root.setAttribute('data-ui-layout', appearance.battleLayout);
  Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
  return () => {
    if (previousId === null) root.removeAttribute('data-ui-appearance');
    else root.setAttribute('data-ui-appearance', previousId);
    if (previousLayout === null) root.removeAttribute('data-ui-layout');
    else root.setAttribute('data-ui-layout', previousLayout);
    previous.forEach(([name, value]) => {
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    });
  };
}
