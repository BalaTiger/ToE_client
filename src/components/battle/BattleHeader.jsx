import React from 'react';

export function BattleHeader({
  isMultiplayer,
  isSpectating,
  showTutorial,
  baseFontSizes,
  scaleRatio,
  isMobile,
  isMobileLandscape,
  mobileZoomCompensate,
  setExitMatchConfirm,
  returnToMainMenu,
  pauseGame,
}) {
  const headerScale = scaleRatio > 1 ? scaleRatio : 1;
  const headerFontScale = isMobileLandscape ? mobileZoomCompensate : headerScale;
  const hp = (scale) => `${Math.round(scale * (isMobileLandscape ? mobileZoomCompensate : headerScale))}px`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: hp(10), borderBottom: '1px solid var(--toe-line-dim,#2a1a08)', paddingBottom: hp(6) }}>
      <div style={{ fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: baseFontSizes.title * headerFontScale, fontWeight: 700, color: 'var(--toe-strong,#c8a96e)', letterSpacing: isMobile ? 1 : 2 }}>邪神的宝藏</div>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: baseFontSizes.subtitle * headerFontScale, color: 'var(--toe-muted,#b89858)', letterSpacing: isMobile ? 1 : 2, marginTop: 1 }}>Treasures of Evils</div>
      {isMultiplayer ? (
        <button
          onClick={() => setExitMatchConfirm({
            message: isSpectating
              ? '你将离开游戏房间，确定要退出吗？'
              : '对局还在进行中，是否退出对局并离开房间？',
          })}
          style={{
            marginLeft: 'auto',
            padding: isMobile ? `${hp(4)} ${hp(10)}` : `${hp(5)} ${hp(12)}`,
            background: '#2a0c08',
            border: '1.5px solid #c2412f',
            color: '#ffb199',
            fontFamily: "'Cinzel',serif",
            fontWeight: 700,
            fontSize: baseFontSizes.small * headerFontScale,
            borderRadius: 3,
            cursor: 'pointer',
            letterSpacing: isMobile ? 0.5 : 1,
            textTransform: 'uppercase',
            boxShadow: '0 0 12px rgba(194,65,47,0.34)',
          }}
        >
          退出对局
        </button>
      ) : (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: hp(8) }}>
          <button
            type="button"
            onClick={pauseGame}
            disabled={showTutorial}
            title={showTutorial ? '教学中不可暂停' : '暂停游戏'}
            style={{
              padding: isMobile ? `${hp(4)} ${hp(10)}` : `${hp(5)} ${hp(12)}`,
              background: '#17120a',
              border: '1.5px solid #9a762f',
              color: '#e8c87a',
              fontFamily: "'Cinzel',serif",
              fontWeight: 700,
              fontSize: baseFontSizes.small * headerFontScale,
              borderRadius: 3,
              cursor: showTutorial ? 'not-allowed' : 'pointer',
              opacity: showTutorial ? 0.45 : 1,
              letterSpacing: isMobile ? 0.5 : 1,
              boxShadow: '0 0 12px rgba(154,118,47,0.25)',
            }}
          >
            暂停游戏
          </button>
          <button
          onClick={showTutorial ? undefined : returnToMainMenu}
          disabled={showTutorial}
          title={showTutorial ? '教学中不可返回主界面' : undefined}
          style={{
            padding: isMobile ? `${hp(4)} ${hp(10)}` : `${hp(5)} ${hp(12)}`,
            background: '#2a0c08',
            border: '1.5px solid #c2412f',
            color: '#ffb199',
            fontFamily: "'Cinzel',serif",
            fontWeight: 700,
            fontSize: baseFontSizes.small * headerFontScale,
            borderRadius: 3,
            cursor: showTutorial ? 'not-allowed' : 'pointer',
            opacity: showTutorial ? 0.45 : 1,
            letterSpacing: isMobile ? 0.5 : 1,
            textTransform: 'uppercase',
            boxShadow: '0 0 12px rgba(194,65,47,0.34)',
          }}
        >
          返回主界面
          </button>
        </div>
      )}
    </div>
  );
}
