import { useRef } from 'react';
import { buildPublicUrl } from '../../utils/url';

export function OnlineOptionsDialog({ open, onClose, multiLoading, handleCreateRoom, handleOpenLobby, joinRoomInput, setJoinRoomInput, handleJoinRoom, renameInputVisible, renameInput, setRenameInput, handleRename, handleRandomUsername, setRenameInputVisible, renameCdActive, playerUsername, playerUsernameSpecial }) {
  const backdropDown = useRef(false);
  if (!open) return null;
  const confirmRename = () => { handleRename(); setRenameInputVisible(false); };
  return <div className="toe-dialog-backdrop" style={{position:'fixed',inset:0,zIndex:1500,display:'flex',alignItems:'center',justifyContent:'center'}}
    onMouseDown={e=>{backdropDown.current=e.target===e.currentTarget;}}
    onClick={e=>{if(e.target===e.currentTarget&&backdropDown.current)onClose();backdropDown.current=false;}}>
    <section className="toe-dialog toe-online-dialog" role="dialog" aria-modal="true" aria-labelledby="toe-online-title" data-ui-dialog="online-options" onClick={e=>e.stopPropagation()} onMouseDown={()=>{backdropDown.current=false;}}>
      <button className="toe-dialog-close" aria-label="关闭联机选项" onClick={onClose} style={{position:'absolute',top:8,right:8}}>×</button>
      <header className="toe-dialog-header"><img src={buildPublicUrl('/img/deco/deco_cth-no-bg.webp')} alt="" style={{width:42,height:48,objectFit:'contain'}}/><h2 id="toe-online-title" className="toe-title" style={{fontSize:24,margin:'8px 0'}}>联机对战</h2><div className="toe-subtitle" style={{fontSize:13}}>与其他旅者一同踏入未知</div></header>
      <div className="toe-online-paths">
        <button className="toe-button toe-button-primary" disabled={multiLoading} onClick={handleCreateRoom}>{multiLoading?'连接中…':'创建房间'}</button>
        <button className="toe-button" disabled={multiLoading} onClick={handleOpenLobby}>游戏大厅</button>
      </div>
      <section className="toe-panel"><label htmlFor="toe-room-code" className="toe-subtitle" style={{display:'block',fontSize:13,marginBottom:8}}>输入房间号加入</label><div style={{display:'flex',gap:8}}>
        <input id="toe-room-code" className="toe-field" value={joinRoomInput} onChange={e=>setJoinRoomInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&handleJoinRoom()} placeholder="6 位房间号" maxLength={6} autoComplete="off" style={{letterSpacing:3}}/>
        <button className="toe-button toe-button-primary" onClick={handleJoinRoom} disabled={multiLoading} style={{flexShrink:0,padding:'8px 14px'}}>加入</button>
      </div></section>
      <section className="toe-panel"><div className="toe-subtitle" style={{fontSize:13,marginBottom:8}}>你的联机用户名</div>
        {renameInputVisible ? <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <input className="toe-field" aria-label="联机用户名" autoFocus value={renameInput} maxLength={10} onChange={e=>setRenameInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!renameCdActive)confirmRename();if(e.key==='Escape')setRenameInputVisible(false);}} />
          <button className="toe-button" onClick={handleRandomUsername}>随机名字</button><button className="toe-button toe-button-primary" disabled={renameCdActive} onClick={confirmRename}>{renameCdActive?'冷却中…':'确认'}</button>
        </div> : <div style={{display:'flex',gap:12,alignItems:'center'}}><span style={{flex:1,overflowWrap:'anywhere',color:playerUsernameSpecial?'#d8b35c':undefined}}>{playerUsername||'—'}</span><button className="toe-button" onClick={()=>{setRenameInput(playerUsername);setRenameInputVisible(true);}}>修改</button></div>}
      </section>
    </section>
  </div>;
}
