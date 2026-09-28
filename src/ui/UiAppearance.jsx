import { createContext, useCallback, useContext, useLayoutEffect, useState } from 'react';
import { UI_APPEARANCES, applyUiAppearance, readUiAppearance, selectUiAppearance } from './appearances';

const UiAppearanceContext = createContext({
  appearance: UI_APPEARANCES[0],
  appearances: UI_APPEARANCES,
  setAppearance: () => {},
});

function getStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function UiAppearanceProvider({ children }) {
  const [appearance, updateAppearance] = useState(() => readUiAppearance(
    getStorage(),
    typeof window === 'undefined' ? '' : window.location.search,
  ));
  const setAppearance = useCallback(id => {
    updateAppearance(selectUiAppearance(id, getStorage()));
  }, []);

  useLayoutEffect(() => applyUiAppearance(appearance, document.documentElement), [appearance]);

  return <UiAppearanceContext.Provider value={{ appearance, setAppearance, appearances: UI_APPEARANCES }}>
    {children}
  </UiAppearanceContext.Provider>;
}

// The hook and its provider intentionally share one public entry point.
// eslint-disable-next-line react-refresh/only-export-components
export function useUiAppearance() {
  return useContext(UiAppearanceContext);
}
