const ROTATE_GS_TOP_LEVEL_INDEX_FIELDS=['currentTurn'];
const ROTATE_GS_TOP_LEVEL_INDEX_ARRAY_FIELDS=['huntAbandoned'];
const ROTATE_GAME_OVER_INDEX_FIELDS=['winnerIdx','winnerIdx2'];
const ROTATE_DRAW_REVEAL_INDEX_FIELDS=['drawerIdx'];
const ROTATE_ABILITYDATA_INDEX_FIELDS=[
  'drawerIdx',
  'swapTi',
  'huntTi',
  'huntingAI',
  'peekHandSource',
  'caveDuelSource',
  'caveDuelTarget',
  'damageLinkSource',
  'roseThornSource',
  'pickSource',
];
const ROTATE_ABILITYDATA_INDEX_ARRAY_FIELDS=[
  'peekHandTargets',
  'caveDuelTargets',
  'damageLinkTargets',
  'roseThornTargets',
  'pickOrder',
];

function rotateIndexedFields(obj,fields,rotateIndex){
  if(!obj)return obj;
  let changed=false;
  const next={...obj};
  fields.forEach(field=>{
    if(next[field]!=null){
      next[field]=rotateIndex(next[field]);
      changed=true;
    }
  });
  return changed?next:obj;
}

function rotateIndexedArrayFields(obj,fields,rotateIndex){
  if(!obj)return obj;
  let changed=false;
  const next={...obj};
  fields.forEach(field=>{
    if(Array.isArray(next[field])){
      next[field]=next[field].map(rotateIndex);
      changed=true;
    }
  });
  return changed?next:obj;
}

function rotateAbilityDataForViewer(abilityData,rotateIndex){
  if(!abilityData)return abilityData;
  const rotatedIndices=rotateIndexedFields(abilityData,ROTATE_ABILITYDATA_INDEX_FIELDS,rotateIndex);
  return rotateIndexedArrayFields(rotatedIndices,ROTATE_ABILITYDATA_INDEX_ARRAY_FIELDS,rotateIndex);
}

function rotateTopLevelGsFieldsForViewer(gs,rotateIndex){
  if(!gs)return gs;
  const rotatedIndices=rotateIndexedFields(gs,ROTATE_GS_TOP_LEVEL_INDEX_FIELDS,rotateIndex);
  return rotateIndexedArrayFields(rotatedIndices,ROTATE_GS_TOP_LEVEL_INDEX_ARRAY_FIELDS,rotateIndex);
}

function rotateGameOverForViewer(gameOver,rotateIndex){
  return rotateIndexedFields(gameOver,ROTATE_GAME_OVER_INDEX_FIELDS,rotateIndex);
}

function rotateDrawRevealForViewer(drawReveal,rotateIndex){
  return rotateIndexedFields(drawReveal,ROTATE_DRAW_REVEAL_INDEX_FIELDS,rotateIndex);
}

export function rotateGsForViewer(gs,myIndex){
  if(!gs||myIndex===0)return gs;
  const N=gs.players.length;
  const ri=i=>(i<0?i:(i-myIndex+N)%N);
  const players=[...gs.players.slice(myIndex),...gs.players.slice(0,myIndex)];
  const rotatedTopLevel=rotateTopLevelGsFieldsForViewer(gs,ri);
  const gameOver=rotateGameOverForViewer(gs.gameOver,ri);
  const drawReveal=rotateDrawRevealForViewer(gs.drawReveal,ri);
  const abilityData=rotateAbilityDataForViewer(gs.abilityData||{},ri);
  return{...rotatedTopLevel,players,gameOver,abilityData,drawReveal};
}

export function derotateGs(gs,myIndex){
  if(!gs||myIndex===0)return gs;
  const N=gs.players.length;
  return rotateGsForViewer(gs,(N-myIndex)%N);
}
