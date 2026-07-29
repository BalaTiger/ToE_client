import React from 'react';
import { getAnimatedCardBack, getAnimatedCardBackFramePaths, getCardBackImage } from '../../constants/card';
import { buildPublicUrl } from '../../utils/url';

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

function useDecodedImages(paths, enabled = true) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    setReady(false);
    if (!enabled || !paths?.length) return undefined;
    if (paths.every(path => decodedFrameCache.get(path))) {
      setReady(true);
      return undefined;
    }
    let cancelled = false;
    const loadOne = path => new Promise(resolve => {
      if (decodedFrameCache.get(path)) {
        resolve();
        return;
      }
      const img = new Image();
      img.onload = async () => {
        try {
          if (img.decode) await img.decode();
        } catch {
          // Loaded images are usable even when decode rejects.
        }
        decodedFrameCache.set(path, true);
        resolve();
      };
      img.onerror = resolve;
      img.src = path;
    });
    Promise.all(paths.map(loadOne)).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, paths]);
  return ready;
}

function getSpecialCardBackImage(card) {
  if (card?.isBlackGoatYoung || card?.isTsathogguaSlime) return '/img/card/cardback_token.png';
  if (card?.effect && !card?.isGod && !card?.isZone) return '/img/card/cardback_sancheck.png';
  return null;
}

function useCardBackStyle(expansionKey, enabled = true, card) {
  const specialBackImage = getSpecialCardBackImage(card);
  const anim = specialBackImage ? null : getAnimatedCardBack(expansionKey);
  const fallbackImage = buildPublicUrl(specialBackImage || getCardBackImage(expansionKey));
  const framePaths = React.useMemo(() => {
    if (specialBackImage) return [];
    return getAnimatedCardBackFramePaths(expansionKey, true).map(path => buildPublicUrl(path));
  }, [expansionKey, specialBackImage]);
  const framesReady = useDecodedImages(framePaths, enabled && framePaths.length > 0);
  const frame = useSpriteFrame(enabled && framesReady, anim?.frameCount || 0, anim?.fps || 12);

  if (!enabled || !framesReady || !anim?.frameCount || !framePaths.length) {
    return {
      mode: 'image',
      backgroundImage: `url('${fallbackImage}')`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  return {
    mode: 'frame',
    image: framePaths[frame],
  };
}

function CardBackFrameImage({ cardBackStyle }) {
  if (cardBackStyle.mode !== 'frame') return null;
  return (
    <img
      src={cardBackStyle.image}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'fill',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    />
  );
}

function AnimatedCardBack({
  expansionKey = '地神的潜影',
  animated = true,
  card,
  style,
  className,
  children,
}) {
  const cardBackStyle = useCardBackStyle(expansionKey, animated, card);
  const isFrame = cardBackStyle.mode === 'frame';
  const {
    mode: _mode,
    image: _frameImage,
    ...plainCardBackStyle
  } = cardBackStyle;
  const {
    background: _background,
    backgroundImage: _backgroundImage,
    backgroundSize: _backgroundSize,
    backgroundPosition: _backgroundPosition,
    backgroundRepeat: _backgroundRepeat,
    animation: _animation,
    ...safeStyle
  } = style || {};
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        backgroundColor: '#100c08',
        ...(isFrame ? {} : plainCardBackStyle),
        overflow: 'hidden',
        ...safeStyle,
      }}
    >
      {isFrame && <CardBackFrameImage cardBackStyle={cardBackStyle}/>}
      {children}
    </div>
  );
}

function CardBackLayer({
  expansionKey = '地神的潜影',
  animated = true,
  card,
  style,
}) {
  const cardBackStyle = useCardBackStyle(expansionKey, animated, card);
  const isFrame = cardBackStyle.mode === 'frame';
  const {
    mode: _mode,
    image: _frameImage,
    ...plainCardBackStyle
  } = cardBackStyle;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        backgroundColor: '#100c08',
        ...(isFrame ? {} : plainCardBackStyle),
        overflow: 'hidden',
        ...style,
      }}
    >
      {isFrame && <CardBackFrameImage cardBackStyle={cardBackStyle}/>}
    </div>
  );
}

export { AnimatedCardBack, CardBackLayer };
