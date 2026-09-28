import { RINFO } from '../../game/setup';
import { buildPublicUrl } from '../../utils/url';

const roleArt = { '寻宝者': 'tr', '追猎者': 'hu', '邪祀者': 'cu' };

export function GameResultScreen({ players, gameOver, iWon, isMultiplayer, onReturnRoom, onRestart, onHome, onShowLog, onClickCapture, children }) {
  const { winner, winnerIdx, winnerIdx2, reason } = gameOver;
  const isLose = winner === 'LOSE' || winner === 'LOSE_ALL';
  const title = isLose ? (winner === 'LOSE_ALL' ? '全员覆灭' : '英魂殒落')
    : iWon ? '胜利归你' : winner === '寻宝者' ? `${players[winnerIdx]?.name || ''}获胜` : `${winner}获胜`;
  return <div className="toe-result" data-ui-dialog="result" onClickCapture={onClickCapture}>
    <main className="toe-dialog toe-result-content">
      <img className="toe-result-emblem" src={buildPublicUrl(roleArt[winner] ? `/img/logo/logo_${roleArt[winner]}-no-bg.webp` : '/img/deco/deco_cth-no-bg.webp')} alt="" />
      <header className="toe-dialog-header"><h1 className="toe-title" style={{fontSize:'clamp(24px,4vw,36px)',margin:'12px 0'}}>{title}</h1><p className="toe-subtitle">{reason}</p></header>
      <section className="toe-result-players" aria-label="玩家结算">
        {players.map((p, i) => {
          const r = RINFO[p.role];
          const won = !isLose && (winner === '寻宝者' ? i === winnerIdx || i === winnerIdx2 : p.role === winner);
          return <article key={p.id} className="toe-panel toe-result-player" data-winner={won} data-dead={!!p.isDead} style={{'--role-color':r?.col}}>
            <strong>{p.name}</strong><br />
            <img src={buildPublicUrl(`/img/logo/logo_${roleArt[p.role] || 'tr'}-no-bg.webp`)} alt="" />
            <p style={{color:r?.col}}>{p.role}</p><p style={{fontSize:13}}>HP {p.hp} · SAN {p.san}</p>
            <p style={{fontSize:12,color:won?'#d7be81':'var(--toe-ui-muted)'}}>{p.isDead ? '已倒下' : won ? '胜者' : '冒险结束'}</p>
          </article>;
        })}
      </section>
      <div className="toe-actions">
        {isMultiplayer ? <button className="toe-button toe-button-primary" onClick={onReturnRoom}>返回房间</button> : <>
          <button className="toe-button toe-button-primary" onClick={onRestart}>再次降临</button>
          <button className="toe-button" onClick={onHome}>返回主页</button>
        </>}
        <button className="toe-button" onClick={onShowLog}>查看完整日志</button>
      </div>
    </main>
    <button type="button" className="surveyMascot" onClick={()=>window.open('https://v.wjx.cn/vm/mGJYO4f.aspx','_blank','noopener,noreferrer')} aria-label="点我填写问卷">
      <span className="surveyMascotBubble">喜欢这个游戏吗？点我填写问卷吧</span>
      <span className="surveyMascotBody" aria-hidden="true"><span className="surveyMascotFace"><span className="surveyMascotEye surveyMascotEyeLeft"/><span className="surveyMascotEye surveyMascotEyeRight"/><span className="surveyMascotSmile"/></span><span className="surveyMascotBook"/></span>
    </button>
    {children}
  </div>;
}
