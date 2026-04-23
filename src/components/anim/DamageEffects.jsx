import React from 'react';

function KnifeEffect({targets}){
  if(!targets||!targets.length)return null;
  return(
    <div style={{position:'fixed',inset:0,zIndex:485,pointerEvents:'none',overflow:'hidden'}}>
      {targets.map(({pi,cx,cy,animKey},idx)=>{
        const delay=(idx*0.08).toFixed(2)+'s';
        const hitDelay=(idx*0.08+0.28).toFixed(2)+'s';
        const startX=window.innerWidth/2;
        const startY=window.innerHeight/2;
        const txPx=cx-startX;
        const tyPx=cy-startY;
        const angle=Math.atan2(tyPx,txPx)*180/Math.PI;
        return(
          <React.Fragment key={animKey||`${pi}-${idx}`}>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:32,height:32,marginLeft:-16,marginTop:-16,
              fontSize:32,lineHeight:1,textAlign:'center',
              filter:'drop-shadow(0 0 4px rgba(200,50,50,0.7))',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,'--angle':`${angle}deg`,
              animation:`knifeStrikeGlobal 0.28s cubic-bezier(0.2,0,0.8,1) ${delay} both`,
              transformOrigin:'center center',
            }}>🗡️</div>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:80,height:80,marginLeft:-40,marginTop:-40,
              background:'radial-gradient(circle,rgba(200,30,30,0.45) 0%,transparent 70%)',
              borderRadius:'inherit',
              animation:'hitFlashGlobal 0.3s ease-out '+hitDelay+' both',
              opacity:0,
            }}/>
            {[{x:30,y:40,s:1.1},{x:55,y:25,s:0.8},{x:70,y:55,s:1.3},{x:20,y:60,s:0.7},{x:45,y:70,s:1.0},{x:65,y:35,s:0.9}].map((d,i)=>{
              const bloodDelay=(idx*0.08+0.26+i*0.028).toFixed(2)+'s';
              return(
                <div key={i} style={{
                  position:'absolute',
                  left:cx-40+d.x*0.8,top:cy-40+d.y*0.8,
                  width:Math.round(5*d.s),height:Math.round(8*d.s),
                  borderRadius:'50% 50% 55% 55%',
                  background:'radial-gradient(ellipse,#cc1010 0%,#880808 70%)',
                  animation:`bloodDrop 0.55s ease-out ${bloodDelay} both`,
                  opacity:0,
                  transform:'translateY(-12px)',
                }}/>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}
function GuillotineAnim({targets}){
  const[phase,setPhase]=React.useState('slice'); // slice, slide

  React.useEffect(()=>{
    const t1=setTimeout(()=>setPhase('slide'),180);
    return()=>{clearTimeout(t1);};
  },[]);

  if(!targets||!targets.length)return null;

  return(
    <div style={{position:'fixed',inset:0,zIndex:1400,pointerEvents:'none',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0)',animation:'guillotineVig 1.1s ease-in-out forwards'}}/>
      {targets.map((t,ti)=>{
        const hasSnapshot=!!t.snapshotUrl;
        return(
          <React.Fragment key={ti}>
            {phase==='slice'&&(
              <div style={{
                position:'absolute',
                left:t.x,top:t.y,width:t.w,height:t.h,
                overflow:'hidden',
                borderRadius:3,
              }}>
                {hasSnapshot&&(
                  <div style={{
                    position:'absolute',
                    inset:0,
                    backgroundImage:`url(${t.snapshotUrl})`,
                    backgroundSize:'100% 100%',
                    backgroundPosition:'center',
                    filter:'brightness(0.92) saturate(0.95)',
                    opacity:0.96,
                  }}/>
                )}
                <div style={{
                  position:'absolute',
                  left:-t.w,top:-t.h,width:t.w*3,height:t.h*3,
                  transform:`rotate(30deg)`,
                  background:'linear-gradient(90deg, transparent 0%, rgba(255,0,0,0.8) 50%, transparent 100%)',
                  animation:'sliceEffect 0.5s ease-out forwards',
                }}/>
                <div style={{
                  position:'absolute',
                  left:t.x-10,top:t.y-10,width:t.w+20,height:t.h+20,
                  background:'radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, rgba(255,100,100,0.6) 50%, transparent 100%)',
                  animation:'sliceFlash 0.3s ease-out forwards',
                }}/>
                <div style={{
                  position:'absolute',
                  left:t.x-20,top:t.y-20,width:t.w+40,height:t.h+40,
                  background:'radial-gradient(ellipse at center, rgba(180,10,10,0.4) 0%, rgba(80,0,0,0.1) 60%, transparent 100%)',
                  animation:'bloodSpread 1s ease-out forwards',
                }}/>
              </div>
            )}
            {phase==='slide'&&(
              <>
                <div style={{
                  position:'absolute',
                  left:t.x,top:t.y,width:t.w,height:t.h/2,
                  overflow:'hidden',
                  borderTopLeftRadius:3,
                  borderTopRightRadius:3,
                  animation:'slideUp 0.82s cubic-bezier(0.08,0.82,0.22,1) forwards',
                  boxShadow:hasSnapshot?'0 6px 18px rgba(0,0,0,0.28)':'none',
                }}>
                  {hasSnapshot?(
                    <div style={{
                      position:'absolute',
                      inset:0,
                      backgroundImage:`url(${t.snapshotUrl})`,
                      backgroundSize:`${t.w}px ${t.h}px`,
                      backgroundPosition:'center top',
                      backgroundRepeat:'no-repeat',
                    }}/>
                  ):(
                    <div style={{
                      position:'absolute',
                      inset:0,
                      background:'linear-gradient(135deg, rgba(255,100,100,0.3) 0%, rgba(255,0,0,0.2) 100%)',
                    }}/>
                  )}
                </div>
                <div style={{
                  position:'absolute',
                  left:t.x,top:t.y+t.h/2,width:t.w,height:t.h/2,
                  overflow:'hidden',
                  borderBottomLeftRadius:3,
                  borderBottomRightRadius:3,
                  animation:'slideDown 0.86s cubic-bezier(0.08,0.82,0.24,1) forwards',
                  boxShadow:hasSnapshot?'0 6px 18px rgba(0,0,0,0.28)':'none',
                }}>
                  {hasSnapshot?(
                    <div style={{
                      position:'absolute',
                      left:0,
                      top:-t.h/2,
                      width:t.w,
                      height:t.h,
                      backgroundImage:`url(${t.snapshotUrl})`,
                      backgroundSize:`${t.w}px ${t.h}px`,
                      backgroundPosition:'center top',
                      backgroundRepeat:'no-repeat',
                    }}/>
                  ):(
                    <div style={{
                      position:'absolute',
                      inset:0,
                      background:'linear-gradient(135deg, rgba(255,100,100,0.3) 0%, rgba(255,0,0,0.2) 100%)',
                    }}/>
                  )}
                </div>
                {hasSnapshot&&(
                  <>
                    <div style={{
                      position:'absolute',
                      left:t.x,
                      top:t.y+(t.h/2)-1,
                      width:t.w,
                      height:2,
                      background:'linear-gradient(90deg, transparent 0%, rgba(255,230,230,0.95) 50%, transparent 100%)',
                      boxShadow:'0 0 12px rgba(255,80,80,0.8)',
                    }}/>
                    <div style={{
                      position:'absolute',
                      left:t.x-10,
                      top:t.y-10,
                      width:t.w+20,
                      height:t.h+20,
                      background:'radial-gradient(ellipse at center, rgba(180,10,10,0.22) 0%, rgba(80,0,0,0.08) 58%, transparent 100%)',
                      animation:'bloodSpread 1s ease-out forwards',
                    }}/>
                  </>
                )}
              </>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export { KnifeEffect, GuillotineAnim };
