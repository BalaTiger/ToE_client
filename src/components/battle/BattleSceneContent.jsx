import { useEffect, useRef } from 'react';

// Shake a visual content layer while backgrounds and viewport overlays stay outside.
export function BattleSceneContent({ shake, paused = false, className = 'toe-battle-content', style, children }) {
  const contentRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    const element = contentRef.current;
    if (!shake || !element?.animate) return undefined;

    const animation = element.animate(shake.keyframes, shake.timing);
    animation.id = 'toe-scene-shake';
    animationRef.current = animation;
    return () => {
      animation.cancel();
      animationRef.current = null;
    };
  }, [shake]);

  useEffect(() => {
    const animation = animationRef.current;
    if (!animation || animation.playState === 'finished' || animation.playState === 'idle') return;
    if (paused) animation.pause();
    else if (animation.playState === 'paused') animation.play();
  }, [paused, shake]);

  return <div ref={contentRef} className={className} style={style}>{children}</div>;
}
