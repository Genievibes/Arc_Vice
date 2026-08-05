// tools/test-flow.js — 실제 index.html 스크립트를 headless 로 구동해 전체 플레이 흐름 검증
// 물주기 → 1단계 달성 순서 및 전체 47일 완주 흐름 검증
// 기획서 '누적 완료 일차' 열이 실제 게임 코드에서 그대로 재현되는지 확인합니다.
var fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
var src=html.match(/<script>([\s\S]*)<\/script>/)[1];
var els={},timers=[];
function el(id){ if(!els[id])els[id]={id:id,textContent:'',innerHTML:'',className:'',style:{},disabled:false,
  classList:{_s:{},add:function(c){this._s[c]=1},remove:function(c){delete this._s[c]},
  toggle:function(c,v){ if(v===undefined)v=!this._s[c]; if(v)this._s[c]=1; else delete this._s[c]; },
  contains:function(c){return !!this._s[c]}},
  appendChild:function(){},addEventListener:function(){},onclick:null,
  querySelector:function(){return el('x')},querySelectorAll:function(){return []},
  getBoundingClientRect:function(){return {width:0,height:0}}};
  return els[id]; }
global.document={getElementById:el,querySelector:function(){return el('q')},
  querySelectorAll:function(){return []},createElement:function(){return el('c'+Math.random())},
  body:el('body'),addEventListener:function(){}};
global.window={addEventListener:function(){}};
global.requestAnimationFrame=function(f){f&&f()};
// setTimeout: run callbacks synchronously via a drain queue
global.setTimeout=function(f,ms){ timers.push(f); return timers.length; };
// setInterval: 콜백을 clearInterval 호출 시점까지 즉시 반복 실행
var ivSeq=0, ivDead={};
global.setInterval=function(f){
  var id=++ivSeq;
  for(var i=0;i<200 && !ivDead[id];i++){ try{f&&f();}catch(e){} }
  return id;
};
global.clearTimeout=function(){};
global.clearInterval=function(id){ ivDead[id]=1; };
global.alert=function(){};
eval(src);
function drain(n){ n=n||5000; var i=0; while(timers.length&&i++<n){ var f=timers.shift(); try{f&&f();}catch(e){} } }

var pass=0,fail=0;
function ok(l,c){ if(c){pass++;console.log('  ✅ '+l);}else{fail++;console.log('  ❌ '+l);} }

console.log('\n[1] 물주기 → 1단계 즉시 달성 (누적 0)');
waterSeed(); drain();
ok('물주기 후 게임 시작', gameStarted===true);
ok('친밀도 0', state.affection===0);
// 1단계 보상 팝업이 열림 (누적 0 = 1단계 달성)
var rp=el('rewardPopup');
ok('1단계 보상 팝업 표시', rp.classList.contains('show'));
if(rp.onclick) rp.onclick();
drain();
// 승급 = 완주 스펙: 친밀도 0 에서는 1단계 유지, 80 을 쌓아야 2단계로 승급
ok('물주기 직후 1단계 유지 (친밀도 0)', growthStage===1);
ok('2단계 달성 누적 = 80', STAGE_THR[2]===80);

console.log('\n[2] 47일 완주 시나리오 (일일 먹이기1 + 놀아주기1 = +40)');
// 승급 팝업을 자동으로 처리하는 헬퍼
function autoEvolve(){
  for(var g=0; g<12; g++){
    if(pendingStage>0){ doEvolve(); drain(); }
    else break;
  }
}
autoEvolve();
var completeDay=null, promoDay=null, levelDay={};
levelDay[growthStage]=1;
for(var d=1; d<=60; d++){
  // 하루 행동: 먹이기(30P) + 놀아주기(10P) = 40P → 친밀도 +40
  if(!isCompleted()) doAction('feed');
  drain(); autoEvolve();
  if(!isCompleted()) doAction('play');
  drain(); autoEvolve();
  if(growthStage>=MAX_STAGE && promoDay===null) promoDay=day;
  if(isCompleted() && completeDay===null) completeDay=day;
  if(!levelDay[growthStage]) levelDay[growthStage]=day;
  if(d<60){ nextDay(); drain(); autoEvolve(); }
}
console.log('     10단계 달성 = '+promoDay+'일차 / 완주 = '+completeDay+'일차 / 최종 친밀도 = '+state.affection);
console.log('     단계별 달성 일차 = '+JSON.stringify(levelDay));
// STAGE_THR[10] === STAGE_MAX === 1,880 → 10단계 달성(승급) = 완주 = 47일차
ok('10단계 달성 47일차', promoDay===47);
ok('완주 47일차', completeDay===47);
ok('승급 == 완주 (동일 일차)', completeDay===promoDay);
ok('최종 친밀도 1,880', state.affection===STAGE_MAX);
// 기획서 표의 '누적 완료 일차' 열과 실측 일치
//  ※ 9단계와 10단계는 기획서상 누적 친밀도가 모두 1,880 으로 동일합니다.
//    ("9단계 완료(누적 1,880) 즉시 10단계 도달" / 10단계 체류·요구치 [-])
//    따라서 47일차에 1,880 을 달성하면 9단계 표시 구간을 통과해 곧바로
//    10단계(만렙코코)가 되며, levelDay[9] 는 기록되지 않습니다 (구간 폭 0).
var DAY_SPEC={1:1,2:2,3:7,4:14,5:20,6:26,7:33,8:40,10:47};
ok('단계별 달성 일차가 기획서 표와 일치 (1~8, 10단계)', (function(){
  for(var s in DAY_SPEC){ if(levelDay[s]!==DAY_SPEC[s]) return false; }
  return true;
})());
ok('3단계 달성 = 7일차 (1주차 단거리 탐험 시점)', levelDay[3]===7);
ok('4단계 달성 = 14일차 (2주차 중거리 탐험 해금 시점)', levelDay[4]===14);
// 9단계는 구간 폭 0 → 표시 구간을 통과 (기획서 [-] 규칙의 직접적 결과)
ok('9단계 표시 구간 폭 0 (1,880 달성 즉시 10단계)',
  STAGE_THR[9]===STAGE_THR[MAX_STAGE] && levelDay[9]===undefined);
// 8단계 → 만렙 사이의 마지막 육성 구간이 7일 (40일차 → 47일차)
ok('8단계(40일차) → 만렙(47일차) 마지막 육성 구간 7일', promoDay-levelDay[8]===7);
ok('완주 상태 (isCompleted)', isCompleted()===true);
ok('이벤트 종료 플래그', eventEnded===true);

console.log('\n[3] 완주 이후 버튼 상태');
updateActionButtons();
ok('먹이기 disabled', el('btn-feed').classList.contains('disabled'));
ok('놀아주기 disabled', el('btn-play').classList.contains('disabled'));
state.weeklyExplore=1; state.exploring=false; state.sp=200;
updateActionButtons();
ok('탐험 활성 유지', !el('btn-explore').classList.contains('disabled'));

console.log('\n[4] 만렙 탐험 = 장거리 (7주차 탐험 보상)');
ok('만렙 성장 단계 = 10단계', growthStage===MAX_STAGE);
ok('만렙 탐험 구간 = 장거리(long)', getExploreType()==='long');
ok('장거리 탐험 보상에 미지의 상자 포함', EXPLORE_DEF.long.box===true);
// 만렙 탐험은 SP 만 소모 (포만감·체력 미소모)
var mh=state.hunger, mhp=state.health, msp=state.sp;
state.weeklyExplore=1; state.exploring=false;
startExplore(); drain();
ok('만렙 탐험: SP 40 소모', state.sp===msp-EXPLORE_SP);
ok('만렙 탐험: 포만감 불변', state.hunger===mh);
ok('만렙 탐험: 체력 불변', state.health===mhp);
ok('만렙 탐험: 친밀도 상한 유지 (1,880)', state.affection===STAGE_MAX);

console.log('\n통과 '+pass+' / 실패 '+fail);
process.exit(fail===0?0:1);
