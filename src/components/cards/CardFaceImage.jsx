import React from 'react';
import { GOD_DEFS, getCardDisplayKey, getGodDisplaySubtitle } from '../../constants/card';
import { buildPublicUrl } from '../../utils/url';
import {
  CARD_FACE_BACKGROUND_FILES,
  CARD_FACE_HEIGHT,
  CARD_FACE_RATIO,
  CARD_FACE_WIDTH,
  getCardFaceMeta,
  isCardIllustrationReady,
  loadCardIllustration,
} from './CardFaceAssets';

function useIllustrationReady(path) {
  const [ready, setReady] = React.useState(() => {
    return isCardIllustrationReady(path);
  });

  React.useEffect(() => {
    let cancelled = false;
    setReady(isCardIllustrationReady(path));
    if (!path) return undefined;
    loadCardIllustration(path).then(ok => {
      if (!cancelled) setReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return ready;
}

function getCardFaceKind(card) {
  return card?.isGod ? 'god' : 'zone';
}

function clampLevel(level) {
  const raw = Number(level) || 1;
  return Math.max(1, Math.min(3, raw));
}

function getGodCardDef(card) {
  return GOD_DEFS[card?.godKey] || null;
}

function getDisplayName(card) {
  if (!card) return '';
  return card.name || getGodCardDef(card)?.name || '';
}

function getSubtitle(card) {
  if (!card?.isGod) return '';
  return getGodDisplaySubtitle(card);
}

function getEffectText(card, godLevel) {
  if (!card) return '';
  if (card.isGod) {
    const def = getGodCardDef(card);
    const desc = def?.levels?.[clampLevel(godLevel) - 1]?.desc || card.desc || '';
    if (/待设计/.test(desc)) return '';
    return desc;
  }
  if (card.type === 'blankZone') return card.desc || '任意字母与数字';
  return card.desc || '';
}

function getCodeText(card) {
  if (!card) return '';
  return getCardDisplayKey(card);
}

function getZoneTitleFontSize(name) {
  const len = [...(name || '')].length;
  if (len > 12) return 23;
  if (len > 9) return 27;
  if (len > 6) return 31;
  return 34;
}

function getGodTitleFontSize(name) {
  const len = [...(name || '')].length;
  if (len > 9) return 24;
  if (len > 6) return 27;
  return 31;
}

function getEffectFontSize(text, isGod) {
  const len = [...(text || '')].length;
  if (isGod) {
    if (len > 76) return 17;
    if (len > 56) return 18.5;
    return 20.5;
  }
  if (len > 72) return 16.5;
  if (len > 48) return 18;
  if (len > 30) return 20;
  return 22;
}

function estimateEffectLineCount(text, fontSize, boxWidth) {
  const len = [...(text || '')].length;
  if (len <= 0) return 1;
  const charsPerLine = Math.max(1, Math.floor(boxWidth / (fontSize * 1.05)));
  return Math.ceil(len / charsPerLine);
}

function getAdaptiveEffectFontSize(text, isGod, box) {
  let fontSize = getEffectFontSize(text, isGod);
  const lineHeight = 1.48;
  const minFontSize = isGod ? 12.5 : 13;
  while (fontSize > minFontSize) {
    const lines = estimateEffectLineCount(text, fontSize, box.width);
    if (lines * fontSize * lineHeight <= box.height) break;
    fontSize -= 0.5;
  }
  return Math.round(fontSize * 10) / 10;
}

function estimateFlavorLineCount(text, fontSize, boxWidth) {
  const len = [...(text || '')].length;
  if (len <= 0) return 1;
  const charsPerLine = Math.max(1, Math.floor(boxWidth / (fontSize * 1.02)));
  return Math.ceil(len / charsPerLine);
}

function getAdaptiveFlavorFontSize(text, isGod, box) {
  let fontSize = isGod ? 17.5 : 18.5;
  const lineHeight = 1.35;
  const minFontSize = 11.5;
  while (fontSize > minFontSize) {
    const lines = estimateFlavorLineCount(text, fontSize, box.width);
    if (lines * fontSize * lineHeight <= box.height) break;
    fontSize -= 0.5;
  }
  return Math.round(fontSize * 10) / 10;
}

const TEXT_COLOR = '#c7b991';
const MUTED_TEXT_COLOR = '#aa9a72';
const SHADOW = '0 1px 0 rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)';
const TITLE_FONT = "'Noto Serif SC','Source Han Serif SC','Songti SC','STZhongsong','SimSun',serif";
const BODY_FONT = "'Noto Serif SC','Source Han Serif SC','Songti SC','SimSun',serif";
const FLAVOR_FONT = "'KaiTi','STKaiti','FangSong','STFangsong','Noto Serif SC',serif";
const FLAVOR_ITALIC_SKEW = 'skewX(-8deg)';
const CODE_FONT = "'Cinzel Decorative','Cinzel','Times New Roman',serif";

const EFFECT_BOX = {
  zone: { left: 45, top: 382, width: 302, height: 104 },
  god: { left: 46, top: 392, width: 300, height: 96 },
};

const FLAVOR_BOX = {
  zone: { left: 42, top: 506, width: 308, height: 56 },
  god: { left: 41, top: 508, width: 310, height: 54 },
};

// Fixed masks derived once from the immutable cardbg art windows.
const ILLUSTRATION_LAYOUT = {
  zone: {
    left: 31,
    top: 137,
    width: 330,
    height: 225,
    clipPath: 'polygon(4% 4%, 7% 0, 93% 0, 96% 4%, 100% 4%, 100% 95%, 96% 95%, 93% 100%, 55% 100%, 54% 98%, 52% 96%, 50% 95%, 48% 96%, 46% 98%, 45% 100%, 7% 100%, 4% 95%, 0 95%, 0 4%)',
  },
  god: {
    left: 31,
    top: 139,
    width: 330,
    height: 229,
    clipPath: 'polygon(4% 4%, 7% 0, 93% 0, 96% 4%, 100% 4%, 100% 95%, 96% 95%, 93% 100%, 55% 100%, 54% 98%, 52% 95%, 50% 94%, 48% 95%, 46% 98%, 45% 100%, 7% 100%, 4% 95%, 0 95%, 0 4%)',
  },
};

function ScaledText({ children, style }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        textAlign: 'center',
        color: TEXT_COLOR,
        textShadow: SHADOW,
        pointerEvents: 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function EffectTextBlock({ text, isGod, box }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: TEXT_COLOR,
        textShadow: SHADOW,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          fontFamily: BODY_FONT,
          fontSize: getAdaptiveEffectFontSize(text, isGod, box),
          fontWeight: 700,
          lineHeight: 1.48,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function FlavorTextBlock({ text, isGod, box }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: MUTED_TEXT_COLOR,
        textShadow: SHADOW,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '94%',
          margin: '0 auto',
          fontFamily: FLAVOR_FONT,
          fontSize: getAdaptiveFlavorFontSize(text, isGod, box),
          fontStyle: 'oblique 10deg',
          transform: FLAVOR_ITALIC_SKEW,
          transformOrigin: 'center center',
          lineHeight: 1.35,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function CardIllustration({ card, kind, scale }) {
  const meta = getCardFaceMeta(card);
  const ready = useIllustrationReady(meta?.illustration);
  const layout = ILLUSTRATION_LAYOUT[kind];
  if (!meta?.illustration || !ready) return null;
  // Positioned in real display px (design coords × scale), NOT inside the scaled 392 layer,
  // so the 1448px source stays sharp at any card size. clipPath is %-based → scale-independent.
  return (
    <div
      style={{
        position: 'absolute',
        left: layout.left * scale,
        top: layout.top * scale,
        width: layout.width * scale,
        height: layout.height * scale,
        clipPath: layout.clipPath,
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      <img
        src={buildPublicUrl(meta.illustration)}
        alt=""
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          display: 'block',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.18))',
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function ZoneCardText({ card }) {
  const name = getDisplayName(card);
  const effect = getEffectText(card, 1);
  const flavor = getCardFaceMeta(card)?.flavor || '';
  return (
    <>
      <ScaledText
        style={{
          top: 38,
          fontFamily: CODE_FONT,
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: 1.5,
        }}
      >
        {getCodeText(card)}
      </ScaledText>
      <ScaledText
        style={{
          top: 79,
          padding: '0 42px',
          fontFamily: TITLE_FONT,
          fontSize: getZoneTitleFontSize(name),
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: 6,
        }}
      >
        {name}
      </ScaledText>
      <EffectTextBlock text={effect} isGod={false} box={EFFECT_BOX.zone} />
      {flavor && <FlavorTextBlock text={flavor} isGod={false} box={FLAVOR_BOX.zone} />}
    </>
  );
}

function GodCardText({ card, godLevel }) {
  const name = getDisplayName(card);
  const subtitle = getSubtitle(card);
  const effect = getEffectText(card, godLevel);
  const flavor = getCardFaceMeta(card)?.flavor || '';
  return (
    <>
      {subtitle ? (
        <>
          <ScaledText
            style={{
              top: 73,
              padding: '0 42px',
              fontFamily: TITLE_FONT,
              fontSize: getGodTitleFontSize(name),
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: 7,
            }}
          >
            {name}
          </ScaledText>
          <ScaledText
            style={{
              top: 108,
              padding: '0 48px',
              fontFamily: TITLE_FONT,
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: 3,
              color: '#b9ac86',
            }}
          >
            {subtitle}
          </ScaledText>
        </>
      ) : (
        <ScaledText
          style={{
            top: 70,
            height: 64,
            padding: '0 42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: TITLE_FONT,
            fontSize: getGodTitleFontSize(name) + 2,
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: 7,
          }}
        >
          {name}
        </ScaledText>
      )}
      <EffectTextBlock text={effect} isGod box={EFFECT_BOX.god} />
      {flavor && <FlavorTextBlock text={flavor} isGod box={FLAVOR_BOX.god} />}
    </>
  );
}

function CardFaceImage({
  card,
  godLevel = 1,
  width = 300,
  style,
  className,
}) {
  if (!card) return null;
  const kind = getCardFaceKind(card);
  const backgroundPath = kind === 'god' ? CARD_FACE_BACKGROUND_FILES[1] : CARD_FACE_BACKGROUND_FILES[0];
  const height = Math.round(width * CARD_FACE_RATIO);
  const scale = width / CARD_FACE_WIDTH;
  return (
    <div
      className={className}
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 12 * scale,
        background: '#07100d',
        boxShadow: '0 18px 38px rgba(0,0,0,0.76), 0 0 32px rgba(190,150,86,0.20)',
        transformOrigin: 'top left',
        userSelect: 'none',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: CARD_FACE_WIDTH,
          height: CARD_FACE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          zIndex: 0,
        }}
      >
        <img
          src={buildPublicUrl(backgroundPath)}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: CARD_FACE_WIDTH,
            height: CARD_FACE_HEIGHT,
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
            pointerEvents: 'none',
          }}
        />
      </div>
      <CardIllustration card={card} kind={kind} scale={scale} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: CARD_FACE_WIDTH,
          height: CARD_FACE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          zIndex: 2,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 32%, rgba(236,214,142,0.05), transparent 54%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {kind === 'god'
            ? <GodCardText card={card} godLevel={godLevel} />
            : <ZoneCardText card={card} />}
        </div>
      </div>
    </div>
  );
}

export { CardFaceImage };
