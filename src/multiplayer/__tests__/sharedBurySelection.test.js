import {describe,expect,it} from 'vitest';
import {preserveSharedBurySelection} from '../multiplayerRemoteReplayExecutor';
import {shouldSuppressNormalStateBroadcast} from '../useMultiplayerStateBroadcast';
const previous={_mpMatchId:'m',_turnKey:2,phase:'BURY_ALIVE_SELECT',players:[{hand:[{id:'a'},{id:'b'}]}],abilityData:{buryAliveId:'decision',buryAliveSelectedIndex:1,buryAliveChoices:[null,null]}};
describe('local unconfirmed selection in a shared response window',()=>{
 it('retains the selected card while another seat confirms and the hand order changes',()=>{
  const incoming={...previous,players:[{hand:[{id:'b'},{id:'a'}]}],abilityData:{...previous.abilityData,buryAliveSelectedIndex:null,buryAliveChoices:[null,{chosen:true}]}};
  expect(preserveSharedBurySelection(previous,incoming).abilityData.buryAliveSelectedIndex).toBe(0);
  expect(incoming.abilityData.buryAliveSelectedIndex).toBe(null);
 });
 it.each([{buryAliveId:'new'},{buryAliveChoices:[{cardId:'a'},null]}])('does not retain a selection after confirmation or a new prompt %j',patch=>{
  const incoming={...previous,abilityData:{...previous.abilityData,buryAliveSelectedIndex:null,...patch}};
  expect(preserveSharedBurySelection(previous,incoming)).toBe(incoming);
 });
 it('keeps an unconfirmed local selection off the ordinary broadcast channel',()=>{
  expect(shouldSuppressNormalStateBroadcast(previous)).toBe(true);
  expect(shouldSuppressNormalStateBroadcast({...previous,abilityData:{buryAliveChoices:[null,null]}})).toBe(false);
 });
});