import { useEffect, useRef, useState } from 'react';
import { useUiAppearance } from '../../ui/UiAppearance';
import { buildPublicUrl } from '../../utils/url';
import { BattleSceneContent } from '../battle/BattleSceneContent';

export function GammaSlider({ gamma, onChange, musicVolume=1, onMusicVolumeChange, sfxVolume=1, onSfxVolumeChange, defaultOpen=false, battleControls, startControlScale }) {
  const { appearance, appearances, setAppearance } = useUiAppearance();
  const [pinned,setPinned] = useState(defaultOpen);
  const [hover,setHover] = useState(false);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const docked = !!battleControls;
  const open=pinned||hover;
  const close=()=>{setPinned(false);setHover(false);};
  useEffect(() => {
    if (!docked || !open) return;
    const dismiss = event => { if (!panelRef.current?.contains(event.target)) { setPinned(false); setHover(false); } };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [docked, open]);
  const gammaPercent=Math.round((gamma-1)*100);
  const triggers = <div className="toe-settings-triggers" data-single={docked ? !!battleControls.isMultiplayer : undefined}>
    {docked && !battleControls.isMultiplayer && <button className="toe-button toe-coastal-system-button" type="button" aria-label="暂停游戏" title={battleControls.showTutorial ? '教学中不可暂停' : '暂停游戏'} disabled={battleControls.showTutorial} onClick={battleControls.onPause}>
      <img className="toe-coastal-system-disc" src={buildPublicUrl('/img/ui/coastal/corner-b-control.webp')} alt="" aria-hidden="true" draggable={false} />
      <img className="toe-coastal-system-glyph" src={buildPublicUrl('/img/ui/coastal/corner-b-pause.svg')} alt="" aria-hidden="true" draggable={false} />
    </button>}
    <button ref={triggerRef} className={`toe-button toe-settings-toggle${docked ? ' toe-coastal-system-button' : ''}`} aria-label={docked ? '对局菜单' : '视听设置'} title={docked ? '对局菜单' : '视听设置'} aria-expanded={open} onClick={()=>setPinned(v=>!v)}>{docked ? <>
      <img className="toe-coastal-system-disc" src={buildPublicUrl('/img/ui/coastal/corner-b-control.webp')} alt="" aria-hidden="true" draggable={false} />
      <img className="toe-coastal-system-glyph" src={buildPublicUrl('/img/ui/coastal/corner-b-settings.svg')} alt="" aria-hidden="true" draggable={false} />
    </> : '☀ / ♪'}</button>
  </div>;
  return <div ref={panelRef} className={`toe-settings${docked ? ' toe-settings-coastal' : startControlScale ? ' toe-settings-start' : ''}`} style={battleControls?.style ?? (startControlScale ? { '--toe-start-control-scale': startControlScale } : undefined)} onMouseEnter={()=>{if(!docked)setHover(true);}} onMouseLeave={()=>setHover(false)} onKeyDown={e=>{if(e.key==='Escape'){close();triggerRef.current?.focus();}}}>
    {docked ? <BattleSceneContent className="toe-settings-trigger-motion" shake={battleControls.shake} paused={battleControls.paused}>{triggers}</BattleSceneContent> : triggers}
    {open&&<section className="toe-dialog toe-settings-panel" aria-label="视听设置面板">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><strong className="toe-title">{docked ? '对局菜单' : '视听设置'}</strong><button className="toe-dialog-close" aria-label="关闭视听设置" onClick={()=>{close();triggerRef.current?.focus();}}>×</button></div>
      <label className="toe-setting-row"><span>亮度</span><input aria-label="亮度" type="range" min={0.5} max={2} step={0.05} value={gamma} onChange={e=>onChange(Number(e.target.value))}/><output>{gammaPercent>0?'+':''}{gammaPercent}%</output></label>
      <label className="toe-setting-row"><span>音乐</span><input aria-label="音乐音量" type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={e=>onMusicVolumeChange?.(Number(e.target.value))}/><output>{Math.round(musicVolume*100)}%</output></label>
      <label className="toe-setting-row"><span>音效</span><input aria-label="音效音量" type="range" min={0} max={1} step={0.05} value={sfxVolume} onChange={e=>onSfxVolumeChange?.(Number(e.target.value))}/><output>{Math.round(sfxVolume*100)}%</output></label>
      <label className="toe-setting-row" style={{gridTemplateColumns:'auto minmax(0,1fr)'}}><span>界面构图</span><select className="toe-field" aria-label="界面构图" value={appearance.id} onChange={e=>setAppearance(e.target.value)} style={{padding:'7px 10px',width:'100%'}}>{appearances.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {docked && <button className="toe-button toe-button-danger toe-settings-exit" disabled={battleControls.showTutorial} title={battleControls.showTutorial ? '教学中不可退出' : undefined} onClick={()=>{close();battleControls.onExit?.();}}>{battleControls.isMultiplayer ? '退出对局' : '返回主界面'}</button>}
    </section>}
  </div>;
}
