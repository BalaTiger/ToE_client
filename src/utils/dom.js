import { computeScaleRatio } from './scale';

let _zoomCompensationDetected=null;
function _detectZoomRectCompensation(){
  if(typeof document==='undefined')return false;
  const zc=document.querySelector('[data-zoom-container]');
  if(!zc)return false;
  const s=computeScaleRatio(window.innerWidth,window.innerHeight);
  if(s===1)return false;
  const test=document.createElement('div');
  test.style.cssText='position:absolute;left:0;top:0;width:100px;height:1px;visibility:hidden;pointer-events:none;';
  zc.appendChild(test);
  const r=test.getBoundingClientRect();
  zc.removeChild(test);
  const expected=100*s;
  if(Math.abs(r.width-expected)<3)return false;
  if(Math.abs(r.width-100)<3)return true;
  return r.width>expected*1.2;
}
function _needsZoomRectCompensation(){
  if(_zoomCompensationDetected===null){
    _zoomCompensationDetected=_detectZoomRectCompensation();
  }
  return _zoomCompensationDetected;
}
export function _getZoomCompensatedRect(el){
  if(!el)return null;
  const rect=el.getBoundingClientRect();
  const s=computeScaleRatio(window.innerWidth,window.innerHeight);
  if(s===1)return rect;
  if(!el.closest?.('[data-zoom-container]'))return rect;
  if(!_needsZoomRectCompensation())return rect;
  return{
    left:rect.left*s,
    top:rect.top*s,
    width:rect.width*s,
    height:rect.height*s,
    right:rect.right*s,
    bottom:rect.bottom*s,
    x:rect.x*s,
    y:rect.y*s,
  };
}

export function getPlayerHandAnchorRect(pid){
  const handStripEl=pid===0
    ? document.querySelector('[data-self-hand-strip]')
    : document.querySelector(`[data-player-hand-strip="${pid}"]`);
  return _getZoomCompensatedRect(handStripEl);
}

export function getPlayerHandAnchorCenter(pid){
  if(pid===0){
    const handStripEl=document.querySelector('[data-self-hand-strip]');
    if(handStripEl){
      const r=_getZoomCompensatedRect(handStripEl);
      if(r&&r.width>0&&r.height>0){
        return {x:r.left+r.width/2,y:r.top+r.height/2};
      }
    }
    const handAreaEl=document.querySelector('[data-hand-area]');
    if(handAreaEl){
      const r=_getZoomCompensatedRect(handAreaEl);
      if(r)return {x:r.left+r.width/2,y:r.top+r.height*0.65};
    }
    return {x:window.innerWidth*0.5,y:window.innerHeight*0.8};
  }
  const handRect=getPlayerHandAnchorRect(pid);
  if(handRect&&handRect.width>0&&handRect.height>0){
    return {x:handRect.left+handRect.width/2,y:handRect.top+handRect.height/2};
  }
  const el=document.querySelector(`[data-pid="${pid}"]`);
  if(el){
    const r=_getZoomCompensatedRect(el);
    if(r)return {x:r.left+r.width/2,y:r.top+r.height*0.74};
  }
  return {x:window.innerWidth*0.5,y:window.innerHeight*0.25};
}

export function getPlayerAreaAnchorCenter(pid){
  const el=document.querySelector(`[data-pid="${pid}"]`);
  if(el){
    const r=_getZoomCompensatedRect(el);
    if(r&&r.width>0&&r.height>0){
      return {x:r.left+r.width/2,y:r.top+r.height*0.35};
    }
  }
  return getPlayerHandAnchorCenter(pid);
}

export function getPlayerGodPowerAnchorCenter(pid){
  const badgeEl=document.querySelector(`[data-god-power-badge="${pid}"]`);
  if(badgeEl){
    const r=_getZoomCompensatedRect(badgeEl);
    if(r&&r.width>0&&r.height>0){
      return {x:r.left+r.width/2,y:r.top+r.height/2};
    }
  }
  const panelEl=document.querySelector(`[data-pid="${pid}"]`);
  const panelRect=_getZoomCompensatedRect(panelEl);
  if(panelRect&&panelRect.width>0&&panelRect.height>0){
    return {x:panelRect.left+panelRect.width*0.58,y:panelRect.top+panelRect.height*0.62};
  }
  return getPlayerAreaAnchorCenter(pid);
}

export function getPileAnchorCenter(selector,fallback){
  const pileEl=document.querySelector(selector);
  if(!pileEl)return fallback;
  const visualPileEl=pileEl.firstElementChild instanceof HTMLElement
    ?pileEl.firstElementChild
    :pileEl;
  const visualRect=_getZoomCompensatedRect(visualPileEl);
  const pileRect=_getZoomCompensatedRect(pileEl);
  const r=(visualRect&&visualRect.width>0&&visualRect.height>0)
    ?visualRect
    :pileRect;
  if(!r||r.width<=0||r.height<=0)return fallback;
  return {x:r.left+r.width/2,y:r.top+r.height/2};
}

// 神选弹窗（GodChoiceModal）大致位于屏幕中上方，用于“邪神牌收入手牌”飞入动画的起点
export function getGodChoiceAnchorCenter(){
  return {x:window.innerWidth*0.5,y:window.innerHeight*0.18};
}
