const DESIGN_WIDTH=1200;

let _zoomCompensationDetected=null;
function _detectZoomRectCompensation(){
  if(typeof document==='undefined')return false;
  const zc=document.querySelector('[data-zoom-container]');
  if(!zc)return false;
  const s=window.innerWidth/DESIGN_WIDTH;
  if(s>=1)return false;
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
  if(window.innerWidth>=DESIGN_WIDTH)return rect;
  if(!el.closest?.('[data-zoom-container]'))return rect;
  if(!_needsZoomRectCompensation())return rect;
  const s=window.innerWidth/DESIGN_WIDTH;
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

export function getPileAnchorCenter(selector,fallback){
  const pileEl=document.querySelector(selector);
  if(!pileEl)return fallback;
  const visualPileEl=pileEl.firstElementChild instanceof HTMLElement
    ?pileEl.firstElementChild
    :pileEl;
  const r=_getZoomCompensatedRect(visualPileEl);
  if(!r)return fallback;
  return {x:r.left+r.width/2,y:r.top+r.height/2};
}
