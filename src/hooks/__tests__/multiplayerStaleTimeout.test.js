import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMpTurnTimerOwnerKey, useMpCthDecisionTimer, useMpDiscardTimer, useMpTurnTimer, useMpDecisionTimer } from '../useMultiplayerTimers';
const runtime=vi.hoisted(()=>({effects:[]}));
vi.mock('react',()=>({useRef:value=>({current:value}),useState:value=>[value,vi.fn()],useEffect:fn=>runtime.effects.push(fn)}));
afterEach(()=>{runtime.effects=[];vi.useRealTimers();});
function mount(hook,gs){
  vi.useFakeTimers();vi.setSystemTime(100000);
  let current=gs;
  const setGs=update=>{current=typeof update==='function'?update(current):update;};
  hook({gs,isMultiplayer:true,isMpCthDecisionPhase:true,isLocalCurrentTurn:s=>s.currentTurn===0,setGs});
  const cleanups=runtime.effects.map(fn=>fn());
  return {setCurrent:value=>{current=value;},get current(){return current;},cleanup:()=>cleanups.forEach(fn=>fn?.())};
}
const base={_mpMatchId:'match',_turnKey:2,currentTurn:0,phase:'DISCARD_PHASE',players:[{hand:[1,2,3,4,5]}],abilityData:{fromEndTurn:true}};
describe('already queued multiplayer timeout vs manual commit',()=>{
  it('does not carry paused action time into a new match with reused turn numbers',()=>{
    expect(getMpTurnTimerOwnerKey(base)).not.toBe(getMpTurnTimerOwnerKey({...base,_mpMatchId:'new-match'}));
  });
  it.each([
    ['manual discard resolved',{...base,_mpEndTurnDiscardResolved:true}],
    ['next turn',{...base,_turnKey:3}],
    ['different phase',{...base,phase:'ACTION'}],
    ['restored new match',{...base,_mpMatchId:'new-match'}],
    ['terminal',{...base,gameOver:{winner:'hunter'}}],
  ])('discard deadline cannot tag %s',(_,next)=>{
    const h=mount(useMpDiscardTimer,base);h.setCurrent(next);
    // The timer task was already queued; passive-effect cleanup has not run.
    vi.advanceTimersByTime(15000);
    expect(h.current).toBe(next);h.cleanup();
  });
  it('current discard deadline still fires once',()=>{
    const h=mount(useMpDiscardTimer,base);vi.advanceTimersByTime(15000);
    expect(h.current._mpAutoDiscard).toBe(true);h.cleanup();
  });
  it('old action timer cannot end a later turn of the same player',()=>{
    const old={...base,phase:'ACTION'};const h=mount(args=>useMpTurnTimer({...args,isMpCthDecisionPhase:false}),old);
    const next={...old,_turnKey:4};h.setCurrent(next);vi.advanceTimersByTime(45000);
    expect(h.current).toBe(next);h.cleanup();
  });
  it('old god deadline cannot consume a different card after manual decision',()=>{
    const old={...base,phase:'GOD_CHOICE',abilityData:{godCard:{id:'old'}}};const h=mount(useMpCthDecisionTimer,old);
    const next={...old,abilityData:{godCard:{id:'new'}}};h.setCurrent(next);vi.advanceTimersByTime(15000);
    expect(h.current).toBe(next);h.cleanup();
  });
});

describe('owned decision deadline retry',()=>{
 it('retries an early server deadline once per tick and cancels on cleanup',()=>{
  const onTimeout=vi.fn(()=>false);
  const h=mount(args=>useMpDecisionTimer({...args,isLocalDecisionActive:true,decisionKey:'bury-id',onTimeout}),base);
  vi.advanceTimersByTime(20000);expect(onTimeout).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(250);expect(onTimeout).toHaveBeenCalledTimes(2);
  h.cleanup();vi.advanceTimersByTime(1000);expect(onTimeout).toHaveBeenCalledTimes(2);
 });
});