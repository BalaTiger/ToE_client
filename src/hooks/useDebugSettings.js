import { useEffect, useMemo, useState } from 'react';
import { LOCAL_DEBUG_KEY, safeLS } from '../utils/runtime';

const DEBUG_FORCE_CARD_KEY = 'cthulhu_debug_force_card';
const DEBUG_FORCE_CARD_TARGET_KEY = 'cthulhu_debug_force_card_target';
const DEBUG_FORCE_CARD_KEEP_KEY = 'cthulhu_debug_force_card_keep';
const DEBUG_FORCE_CARD_TYPE_KEY = 'cthulhu_debug_force_card_type';
const DEBUG_FORCE_ZONE_CARD_KEY = 'cthulhu_debug_force_zone_card_key';
const DEBUG_FORCE_ZONE_CARD_NAME_KEY = 'cthulhu_debug_force_zone_card_name';
const DEBUG_FORCE_GOD_CARD_KEY = 'cthulhu_debug_force_god_card_key';
const DEBUG_TUTORIAL_PROMPT_MODE_KEY = 'cthulhu_debug_tutorial_prompt_mode';
const DEBUG_FORCE_TUTORIAL_PROMPT_KEY = 'cthulhu_debug_force_tutorial_prompt';
const DEBUG_EXPANSION_KEY = 'cthulhu_debug_expansion';
const DEBUG_ROLE_COMPOSITION_KEY = 'cthulhu_debug_role_composition';

function normalizeTutorialPromptMode(mode) {
  return mode === 'show' || mode === 'hide' ? mode : 'default';
}

export function useDebugSettings({
  isLocalTestMode,
  expansionRandomKey,
  defaultZoneCardName = '',
}) {
  const [localDebugMode, setLocalDebugMode] = useState(() => isLocalTestMode && safeLS.get(LOCAL_DEBUG_KEY) === '1');
  const [debugForceCard, setDebugForceCard] = useState(() => isLocalTestMode && safeLS.get(DEBUG_FORCE_CARD_KEY) || null);
  const [debugForceCardTarget, setDebugForceCardTarget] = useState(() => isLocalTestMode && safeLS.get(DEBUG_FORCE_CARD_TARGET_KEY) || 'player');
  const [debugForceCardKeep, setDebugForceCardKeep] = useState(() => isLocalTestMode && safeLS.get(DEBUG_FORCE_CARD_KEEP_KEY) || 'auto');
  const [debugForceCardType, setDebugForceCardType] = useState(() => isLocalTestMode && safeLS.get(DEBUG_FORCE_CARD_TYPE_KEY) || 'zone');
  const [debugForceZoneCardKey, setDebugForceZoneCardKey] = useState(() => isLocalTestMode && safeLS.get(DEBUG_FORCE_ZONE_CARD_KEY) || 'A1');
  const [debugForceZoneCardName, setDebugForceZoneCardName] = useState(
    () => isLocalTestMode && safeLS.get(DEBUG_FORCE_ZONE_CARD_NAME_KEY) || defaultZoneCardName
  );
  const [debugForceGodCardKey, setDebugForceGodCardKey] = useState(() => isLocalTestMode && safeLS.get(DEBUG_FORCE_GOD_CARD_KEY) || 'NYA');
  const [debugExpansionKey, setDebugExpansionKey] = useState(() => isLocalTestMode && safeLS.get(DEBUG_EXPANSION_KEY) || '地神的潜影');
  const [debugRoleCompositionKey, setDebugRoleCompositionKey] = useState(
    () => isLocalTestMode && safeLS.get(DEBUG_ROLE_COMPOSITION_KEY) || 'random'
  );
  const [debugTutorialPromptMode, setDebugTutorialPromptMode] = useState(() => {
    if (!isLocalTestMode) return 'default';
    const mode = normalizeTutorialPromptMode(safeLS.get(DEBUG_TUTORIAL_PROMPT_MODE_KEY));
    if (mode !== 'default') return mode;
    return safeLS.get(DEBUG_FORCE_TUTORIAL_PROMPT_KEY) === '1' ? 'show' : 'default';
  });

  const activeDebugConfig = useMemo(() => {
    if (!localDebugMode) {
      return {
        debugForceCard: null,
        debugForceCardTarget: null,
        debugForceCardKeep: 'auto',
        debugForceCardType: null,
        debugForceZoneCardKey: null,
        debugForceZoneCardName: null,
        debugForceGodCardKey: null,
        debugTutorialPromptMode: 'default',
        debugExpansionKey: expansionRandomKey,
        debugRoleCompositionKey: 'random',
      };
    }
    return {
      debugForceCard,
      debugForceCardTarget,
      debugForceCardKeep,
      debugForceCardType,
      debugForceZoneCardKey,
      debugForceZoneCardName,
      debugForceGodCardKey,
      debugTutorialPromptMode,
      debugExpansionKey,
      debugRoleCompositionKey,
    };
  }, [
    localDebugMode,
    debugForceCard,
    debugForceCardTarget,
    debugForceCardKeep,
    debugForceCardType,
    debugForceZoneCardKey,
    debugForceZoneCardName,
    debugForceGodCardKey,
    debugTutorialPromptMode,
    debugExpansionKey,
    debugRoleCompositionKey,
    expansionRandomKey,
  ]);

  useEffect(() => {
    if (!isLocalTestMode) return;
    safeLS.set(LOCAL_DEBUG_KEY, localDebugMode ? '1' : '0');
  }, [isLocalTestMode, localDebugMode]);

  useEffect(() => {
    if (!isLocalTestMode) return;
    safeLS.set(DEBUG_FORCE_CARD_KEY, debugForceCard || '');
    safeLS.set(DEBUG_FORCE_CARD_TARGET_KEY, debugForceCardTarget);
    safeLS.set(DEBUG_FORCE_CARD_KEEP_KEY, debugForceCardKeep);
    safeLS.set(DEBUG_FORCE_CARD_TYPE_KEY, debugForceCardType);
    safeLS.set(DEBUG_FORCE_ZONE_CARD_KEY, debugForceZoneCardKey);
    safeLS.set(DEBUG_FORCE_ZONE_CARD_NAME_KEY, debugForceZoneCardName);
    safeLS.set(DEBUG_FORCE_GOD_CARD_KEY, debugForceGodCardKey);
  }, [
    isLocalTestMode,
    debugForceCard,
    debugForceCardTarget,
    debugForceCardKeep,
    debugForceCardType,
    debugForceZoneCardKey,
    debugForceZoneCardName,
    debugForceGodCardKey,
  ]);

  useEffect(() => {
    if (!isLocalTestMode) return;
    safeLS.set(DEBUG_EXPANSION_KEY, debugExpansionKey);
    safeLS.set(DEBUG_ROLE_COMPOSITION_KEY, debugRoleCompositionKey);
  }, [isLocalTestMode, debugExpansionKey, debugRoleCompositionKey]);

  useEffect(() => {
    if (!isLocalTestMode) return;
    const mode = normalizeTutorialPromptMode(debugTutorialPromptMode);
    safeLS.set(DEBUG_TUTORIAL_PROMPT_MODE_KEY, mode);
    safeLS.set(DEBUG_FORCE_TUTORIAL_PROMPT_KEY, mode === 'show' ? '1' : '0');
  }, [isLocalTestMode, debugTutorialPromptMode]);

  return {
    activeDebugConfig,
    localDebugMode,
    setLocalDebugMode,
    debugForceCard,
    setDebugForceCard,
    debugForceCardTarget,
    setDebugForceCardTarget,
    debugForceCardKeep,
    setDebugForceCardKeep,
    debugForceCardType,
    setDebugForceCardType,
    debugForceZoneCardKey,
    setDebugForceZoneCardKey,
    debugForceZoneCardName,
    setDebugForceZoneCardName,
    debugForceGodCardKey,
    setDebugForceGodCardKey,
    debugTutorialPromptMode,
    setDebugTutorialPromptMode,
    debugExpansionKey,
    setDebugExpansionKey,
    debugRoleCompositionKey,
    setDebugRoleCompositionKey,
  };
}
