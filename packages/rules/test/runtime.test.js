import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandomCursor, nextRandom, ruleRandom, ruleNow, withRuleContext } from '../src/runtime.js';
import { executeRuleResolution } from '../src/execution.js';
import { initGame } from '../src/game/setup.js';
import { startNextTurn } from '../src/game/turnEngine.js';
import { createBlackGoatYoungCard } from '../src/constants/card.js';
import { runAiPreview } from '../src/game/aiPreviewRuntime.js';

test('external host randomness has no serializable cursor and cannot silently use the offline stream',()=>{
 const cursor=createRandomCursor(77),before=structuredClone(cursor);let calls=0;
 const value=executeRuleResolution({cursor,random:()=>{calls++;return 0.25;},now:0,namespace:'external'},()=>ruleRandom());
 assert.equal(value,0.25);assert.equal(calls,1);assert.deepEqual(cursor,before);
 assert.throws(()=>executeRuleResolution({cursor:null,now:0,namespace:'missing'},()=>ruleRandom()),/Invalid random cursor/);
 assert.throws(()=>executeRuleResolution({random:()=>1,now:0,namespace:'invalid'},()=>ruleRandom()),/Invalid rule random/);
 assert.throws(()=>executeRuleResolution({cursor,random:()=>{throw Error('entropy unavailable');},now:0,namespace:'failed'},()=>ruleRandom()),/entropy unavailable/);
 assert.deepEqual(cursor,before);
 assert.equal(executeRuleResolution({cursor:createRandomCursor(77),now:0,namespace:'offline'},()=>ruleRandom()),
  executeRuleResolution({cursor:structuredClone(before),now:0,namespace:'offline'},()=>ruleRandom()));
});

test('rule contexts nest without replacing the host random function or consuming its cursor',()=>{
 const original=Math.random,cursor=createRandomCursor(19);
 withRuleContext({random:()=>nextRandom(cursor),now:()=>123},()=>{
  ruleRandom(); const before=structuredClone(cursor);
  runAiPreview(()=>{ruleRandom();ruleRandom();assert.equal(Math.random,original);});
  assert.deepEqual(cursor,before);assert.equal(ruleNow(),123);
 });assert.equal(Math.random,original);
});
test('exception and async rejection restore the enclosing host context',()=>{
 withRuleContext({random:()=>0.9},()=>{
  assert.throws(()=>withRuleContext({random:()=>0.1},()=>{throw Error('fail');}),/fail/);
  assert.equal(ruleRandom(),0.9);
  assert.throws(()=>withRuleContext({},async()=>1),/synchronous/);
  assert.throws(()=>withRuleContext({},()=>Promise.resolve(1)),/promise/);
 });
});
test('identical state/host inputs produce identical initialized rules and generated identities in Node',()=>{
 const run=()=>{
  const cursor=createRandomCursor(99);
  const state=executeRuleResolution({cursor,now:200,namespace:'same:0'},()=>({
   gs:initGame(['A','B','C'],null,null,'auto',null,null,null,null,startNextTurn,'地神的潜影'),
   card:createBlackGoatYoungCard(),
  }));return {state,cursor};
 };
 const first=run();executeRuleResolution({cursor:createRandomCursor(90),now:300,namespace:'other:0'},()=>createBlackGoatYoungCard());
 assert.deepEqual(run(),first);assert.ok(first.cursor.draws>0);
});
test('resolution namespace prevents cross-match card identity collisions',()=>{
 const run=namespace=>executeRuleResolution({cursor:createRandomCursor(1),now:1,namespace},()=>createBlackGoatYoungCard());
 assert.notEqual(run('a:0').id,run('b:0').id);
});
