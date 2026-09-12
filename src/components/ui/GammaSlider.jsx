import { useState } from 'react';
import { createPortal } from 'react-dom';

export function GammaSlider({ gamma, onChange, musicVolume=1, onMusicVolumeChange, sfxVolume=1, onSfxVolumeChange, defaultOpen=false }) {
  const [pinned,setPinned] = useState(defaultOpen);
  const [hover,setHover] = useState(false);
  const open=pinned||hover;
  const close=()=>{setPinned(false);setHover(false);};
  const gammaPercent=Math.round((gamma-1)*100);
  return createPortal(<div className="toe-settings" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onKeyDown={e=>{if(e.key==='Escape')close();}}>
    <button className="toe-button toe-settings-toggle" aria-label="视听设置" aria-expanded={open} onClick={()=>setPinned(v=>!v)}>☀ / ♪</button>
    {open&&<section className="toe-dialog toe-settings-panel" aria-label="视听设置面板">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><strong className="toe-title">视听设置</strong><button className="toe-dialog-close" aria-label="关闭视听设置" onClick={close}>×</button></div>
      <label className="toe-setting-row"><span>亮度</span><input aria-label="亮度" type="range" min={0.5} max={2} step={0.05} value={gamma} onChange={e=>onChange(Number(e.target.value))}/><output>{gammaPercent>0?'+':''}{gammaPercent}%</output></label>
      <label className="toe-setting-row"><span>音乐</span><input aria-label="音乐音量" type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={e=>onMusicVolumeChange?.(Number(e.target.value))}/><output>{Math.round(musicVolume*100)}%</output></label>
      <label className="toe-setting-row"><span>音效</span><input aria-label="音效音量" type="range" min={0} max={1} step={0.05} value={sfxVolume} onChange={e=>onSfxVolumeChange?.(Number(e.target.value))}/><output>{Math.round(sfxVolume*100)}%</output></label>
    </section>}
  </div>,document.body);
}
