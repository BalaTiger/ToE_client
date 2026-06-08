import React from 'react';
import { getAnimatedCardBack, getCardBackImage } from '../../constants/card';

const decodedFrameCache = new Map();

function useSpriteFrame(enabled, frameCount, fps) {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    setFrame(0);
    if (!enabled || !frameCount) return undefined;
    const frameMs = 1000 / (fps || 12);
    const timer = window.setInterval(() => {
      setFrame(prev => (prev + 1) % frameCount);
    }, frameMs);
    return () => window.clearInterval(timer);
  }, [enabled, frameCount, fps]);
  return frame;
}

function useDecodedImage(path, enabled = true) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    setReady(false);
    if (!enabled || !path) return undefined;
    if (decodedFrameCache.get(path)) {
      setReady(true);
      return undefined;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = async () => {
      try {
        if (img.decode) await img.decode();
      } catch {
        // Loaded images are still usable if decode rejects.
      }
      decodedFrameCache.set(path, true);
      if (!cancelled) setReady(true);
    };
    img.onerror = () => {
      if (!cancelled) setReady(false);
    };
    img.src = path;
    return () => {
      cancelled = true;
    };
  }, [enabled, path]);

  return ready;
}

function useCardBackStyle(expansionKey, enabled = true) {
  const anim = getAnimatedCardBack(expansionKey);
  const fallbackImage = getCardBackImage(expansionKey);
  const sprite = anim?.sprite;
  const ready = useDecodedImage(sprite, enabled);
  const frame = useSpriteFrame(enabled && ready, anim?.frameCount || 0, anim?.fps || 12);

  if (!enabled || !ready || !sprite || !anim?.frameCount) {
    return {
      mode: 'image',
      backgroundImage: `url('${fallbackImage}')`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  return {
    mode: 'sprite',
    sprite,
    frameCount: anim.frameCount,
    frame,
  };
}

function CardBackSpriteImage({ cardBackStyle }) {
  if (cardBackStyle.mode !== 'sprite') return null;
  return (
    <img
      src={cardBackStyle.sprite}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: `${cardBackStyle.frameCount * 100}%`,
        height: '100%',
        maxWidth: 'none',
        objectFit: 'fill',
        objectPosition: 'left top',
        pointerEvents: 'none',
        userSelect: 'none',
        transform: `translateX(-${(cardBackStyle.frame * 100) / cardBackStyle.frameCount}%)`,
      }}
    />
  );
}

function AnimatedCardBack({
  expansionKey = '地神的潜影',
  animated = true,
  style,
  className,
  children,
}) {
  const cardBackStyle = useCardBackStyle(expansionKey, animated);
  const isSprite = cardBackStyle.mode === 'sprite';
  const {
    mode: _mode,
    sprite: _sprite,
    frameCount: _frameCount,
    frame: _spriteFrame,
    ...plainCardBackStyle
  } = cardBackStyle;
  const {
    background,
    backgroundImage,
    backgroundSize,
    backgroundPosition,
    backgroundRepeat,
    animation,
    ...safeStyle
  } = style || {};
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        backgroundColor: '#100c08',
        ...(isSprite ? {} : plainCardBackStyle),
        overflow: 'hidden',
        ...safeStyle,
      }}
    >
      {isSprite && <CardBackSpriteImage cardBackStyle={cardBackStyle}/>}
      {children}
    </div>
  );
}

function CardBackLayer({
  expansionKey = '地神的潜影',
  animated = true,
  style,
}) {
  const cardBackStyle = useCardBackStyle(expansionKey, animated);
  const isSprite = cardBackStyle.mode === 'sprite';
  const {
    mode: _mode,
    sprite: _sprite,
    frameCount: _frameCount,
    frame: _spriteFrame,
    ...plainCardBackStyle
  } = cardBackStyle;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        backgroundColor: '#100c08',
        ...(isSprite ? {} : plainCardBackStyle),
        overflow: 'hidden',
        ...style,
      }}
    >
      {isSprite && <CardBackSpriteImage cardBackStyle={cardBackStyle}/>}
    </div>
  );
}

export { AnimatedCardBack, CardBackLayer, useCardBackStyle };
