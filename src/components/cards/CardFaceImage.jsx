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
  if (card?.isGod) return 'god';
  if (card?.isBlackGoatYoung || card?.isTsathogguaSlime) return 'token';
  if (card?.effect && !card?.isZone) return 'inspection';
  return 'zone';
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
  if (card.type === 'geomagneticRestore') return card.desc || '这张牌消失并消除当前"地磁反转"效果';
  if (card.type === 'blankZone') return card.desc || '任意字母与数字';
  if (card.effect && !card.isZone) return card.desc || INSPECTION_EFFECT_TEXT[card.effect] || '';
  return card.desc || '';
}

function getCodeText(card) {
  if (!card) return '';
  if (card.type === 'geomagneticRestore') return '';
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
  const charsPerLine = Math.max(1, Math.floor(boxWidth / (fontSize * 1.3)));
  return Math.ceil(len / charsPerLine);
}

function getAdaptiveFlavorFontSize(text, isGod, box) {
  let fontSize = isGod ? 17.5 : 18.5;
  const lineHeight = 1.26;
  const minFontSize = 10.5;
  const innerWidth = box.width * 0.94;
  const safeHeight = box.height - 7;
  while (fontSize > minFontSize) {
    const lines = estimateFlavorLineCount(text, fontSize, innerWidth);
    if (lines * fontSize * lineHeight <= safeHeight) break;
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

const INSPECTION_EFFECT_TEXT = {
  adjacentDamageHP: '相邻角色失去 1 HP',
  selfDamageHP: '失去 1 HP',
  disableRest: '下一回合禁用“休息”',
  nothing: '什么也不做',
  flip: '翻面',
  discardRandom: '随机弃一张牌',
  disableSkill: '下一回合禁用技能',
  handLimitDecrease: '下一回合手牌上限 -1',
  healSAN: '恢复 1 SAN',
  drawCard: '从牌堆摸一张牌',
  sealLoosening: '连续翻出两次时邪神复活',
  houndsOfTindalos: '首个超时超过 15 秒的回合失去 4 HP',
};

const EFFECT_BOX = {
  zone: { left: 45, top: 382, width: 302, height: 104 },
  god: { left: 46, top: 392, width: 300, height: 96 },
  inspection: { left: 45, top: 445, width: 302, height: 72 },
  token: { left: 42, top: 392, width: 308, height: 142 },
};

const FLAVOR_BOX = {
  zone: { left: 42, top: 506, width: 308, height: 56 },
  god: { left: 41, top: 508, width: 310, height: 54 },
};

// Fixed masks traced from the inner edge of the immutable card-frame windows.
// The additional points around the lower corners and centre crest avoid exposing
// the dark frame texture between an illustration and its gold border.
const ILLUSTRATION_CLIP_PATH = 'polygon(4.773% 0, 95.227% 0, 96.462% 0.25%, 97.614% 1%, 98.602% 2.1%, 99.36% 3.5%, 99.837% 5.2%, 100% 7%, 100% 93%, 99.837% 94.8%, 99.36% 96.5%, 98.602% 97.9%, 97.614% 99%, 96.462% 99.75%, 95.227% 100%, 53.939% 102.972%, 53.411% 100.083%, 52.785% 98.886%, 51.97% 97.968%, 51.02% 97.39%, 50% 97.194%, 48.98% 97.39%, 48.03% 97.968%, 47.215% 98.886%, 46.589% 100.083%, 46.061% 102.972%, 4.773% 100%, 3.538% 99.75%, 2.386% 99%, 1.398% 97.9%, 0.64% 96.5%, 0.163% 94.8%, 0 93%, 0 7%, 0.163% 5.2%, 0.64% 3.5%, 1.398% 2.1%, 2.386% 1%, 3.538% 0.25%)';

const ILLUSTRATION_LAYOUT = {
  zone: {
    left: 31,
    top: 137,
    width: 330,
    height: 225,
    clipPath: ILLUSTRATION_CLIP_PATH,
  },
  god: {
    left: 31,
    top: 139,
    width: 330,
    height: 229,
    clipPath: ILLUSTRATION_CLIP_PATH,
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
          lineHeight: 1.26,
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

function InspectionCardText({ card }) {
  const name = getDisplayName(card);
  return (
    <>
      <ScaledText
        style={{
          top: 78,
          padding: '0 42px',
          fontFamily: TITLE_FONT,
          fontSize: getZoneTitleFontSize(name) + 2,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: 7,
        }}
      >
        {name}
      </ScaledText>
      <EffectTextBlock text={getEffectText(card, 1)} isGod={false} box={EFFECT_BOX.inspection} />
    </>
  );
}

function TokenCardText({ card }) {
  const name = getDisplayName(card);
  return (
    <>
      <ScaledText
        style={{
          top: 74,
          padding: '0 38px',
          fontFamily: TITLE_FONT,
          fontSize: getZoneTitleFontSize(name),
          fontWeight: 800,
          lineHeight: 1.06,
          letterSpacing: name.length > 7 ? 3 : 6,
        }}
      >
        {name}
      </ScaledText>
      <EffectTextBlock text={getEffectText(card, 1)} isGod={false} box={EFFECT_BOX.token} />
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
  const backgroundPath = {
    zone: CARD_FACE_BACKGROUND_FILES[0],
    god: CARD_FACE_BACKGROUND_FILES[1],
    inspection: CARD_FACE_BACKGROUND_FILES[2],
    token: CARD_FACE_BACKGROUND_FILES[3],
  }[kind];
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
            : kind === 'inspection'
              ? <InspectionCardText card={card} />
              : kind === 'token'
                ? <TokenCardText card={card} />
                : <ZoneCardText card={card} />}
        </div>
      </div>
    </div>
  );
}

export { CardFaceImage };
