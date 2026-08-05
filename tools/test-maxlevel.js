// 만렙 이후 규칙 검증 (headless)
/* 만렙 이후 규칙 검증 — index.html 의 실제 게임 코드를 headless 로 실행
 *   사용법: node tools/test-maxlevel.js
 */
var fs=require('fs');
var path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
var m=html.match(/<script>([\s\S]*)<\/script>/);
var src=m[1];
var els={};
function el(id){ if(!els[id])els[id]={id:id,textContent:'',innerHTML:'',className:'',style:{},
  classList:{_s:{},add:function(c){this._s[c]=1},remove:function(c){delete this._s[c]},
  toggle:function(c,v){ if(v===undefined)v=!this._s[c]; if(v)this._s[c]=1; else delete this._s[c]; },
  contains:function(c){return !!this._s[c]}},
  appendChild:function(){},addEventListener:function(){},onclick:null,querySelector:function(){return el('x')},
  querySelectorAll:function(){return []},getBoundingClientRect:function(){return {width:0,height:0}}};
  return els[id]; }
global.document={getElementById:el,querySelector:function(){return el('q')},
  querySelectorAll:function(){return []},createElement:function(){return el('c'+Math.random())},
  body:el('body'),addEventListener:function(){}};
global.window={addEventListener:function(){}};
global.requestAnimationFrame=function(f){};
global.setTimeout=function(f){return 0};
global.setInterval=function(){return 0};
global.clearTimeout=function(){};global.clearInterval=function(){};
global.alert=function(){};
eval(src);

var pass=0,fail=0;
function ok(label,cond){ if(cond){pass++;console.log('  ✅ '+label);} else {fail++;console.log('  ❌ '+label);} }

// ══════════════════════════════════════════════════════════
//  [A] 완주 직전 구간(8단계 달성 ~ 완주 직전, 1,600 ~ 1,879) — 모든 규칙 정상 동작
//      ※ 승급 = 완주 이므로 "10단계인데 아직 완주 아님" 구간은 존재하지 않음.
//        9단계 완료(1,880) = 10단계 달성 = 완주 = 탐험 전용 전환 시점.
//      ※ STAGE_THR[9] === STAGE_THR[10] === 1,880 이므로 마지막 육성 구간은
//        8단계 달성(1,600 / 40일차) → 1,880(47일차) 까지의 7일입니다.
// ══════════════════════════════════════════════════════════
console.log('\n[A] 완주 직전 구간(1,600 → 1,879) — 정상 플레이 유지');
gameStarted=true; eventEnded=false;
growthStage=MAX_STAGE-2;
state.affection=STAGE_THR[MAX_STAGE-2];   // 1,600 = 8단계 달성선 (완주 아님)
state.hunger=60; state.health=60;
state.sp=200; state.spUsedToday=0; state.giftGiven=false; state.feedUsedToday=false;
state.weeklyExplore=1; state.exploring=false;

ok('8단계 달성(1,600)은 완주가 아님 (isCompleted=false)', isCompleted()===false);
ok('완주 직전 마지막 육성 구간 = 1,600 → 1,880 (7일)',
  STAGE_MAX-STAGE_THR[MAX_STAGE-2]===280);

var aSp=state.sp, aAff=state.affection;
doAction('feed');
ok('완주 전 구간: 먹이기 정상 동작 (친밀도 +20)',
  state.affection===aAff+ACTIONS.feed.affection && state.sp===aSp-ACTIONS.feed.sp);

aSp=state.sp; aAff=state.affection;
doAction('play');
ok('완주 전 구간: 놀아주기 정상 동작 (친밀도 +20)',
  state.affection===aAff+ACTIONS.play.affection && state.sp===aSp-ACTIONS.play.sp);

updateActionButtons();
ok('완주 전 구간: 먹이기/놀아주기 버튼 활성 유지',
  !document.getElementById('btn-play').classList.contains('disabled'));

// 완주 전 구간의 탐험은 스탯 소모 O
var bH=state.hunger, bHp=state.health;
state.exploring=false; state.weeklyExplore=1; state.sp=200; state.affection=1700;
startExplore();
ok('완주 전 탐험: 포만감 -25 적용', state.hunger===bH-25);
ok('완주 전 탐험: 체력 -30 적용', state.health===bHp-30);
ok('완주 전 탐험: 친밀도 +40 (1,700 → 1,740)', state.affection===1740);

// 완주 전 구간에서는 일일 패널티도 계속 적용
state.exploring=false;
var bH2=state.hunger, bHp2=state.health;
nextDay();
ok('완주 전 구간: 일일 패널티 적용',
  state.hunger===bH2-DAILY_PEN_HUNGER && state.health===bHp2-DAILY_PEN_HEALTH);

// ══════════════════════════════════════════════════════════
//  [B] 완주 도달 회차 탐험 (1,840 → +40 = 1,880)
//      이 회차는 "완주 전"이므로 스탯 소모/일일 보상이 정상 적용되어야 함
// ══════════════════════════════════════════════════════════
console.log('\n[B] 완주 도달 회차 (1,840 → 1,880) — 소모 시점 판정');
state.affection=1840; state.hunger=70; state.health=70;
state.sp=200; state.spUsedToday=0; state.giftGiven=false;
state.exploring=false; state.weeklyExplore=1;
var cH=state.hunger, cHp=state.health;
startExplore();
ok('완주 도달 회차: 친밀도 1,880 도달', state.affection===STAGE_MAX);
ok('완주 도달 회차: 스탯 소모 정상 적용 (완주 전 기준)',
  state.hunger===cH-25 && state.health===cHp-30);
ok('완주 도달 회차: 당일 일일 보상 유지', state.giftGiven===true);
ok('이제 완주 상태 (isCompleted=true)', isCompleted()===true);

// ══════════════════════════════════════════════════════════
//  [C] 완주(1,880) 이후 규칙
//      SP 지급 유지 / 패널티 미적용 / 먹이기·놀아주기 비활성 /
//      일일 보상 불가 / 탐험 유지 (SP만 소모)
// ══════════════════════════════════════════════════════════
console.log('\n[C] 완주(1,880) 이후 규칙 검증');
state.hunger=55; state.health=50;
state.sp=200; state.spUsedToday=0; state.giftGiven=false; state.feedUsedToday=false;
state.weeklyExplore=1; state.exploring=false;

// 1) 먹이기/놀아주기 비활성
var spBefore=state.sp, affBefore=state.affection;
doAction('feed');
ok('완주: 먹이기 차단 (SP/친밀도 불변)', state.sp===spBefore && state.affection===affBefore);
doAction('play');
ok('완주: 놀아주기 차단 (SP/친밀도 불변)', state.sp===spBefore && state.affection===affBefore);

// 2) 버튼 상태
updateActionButtons();
ok('완주: 먹이기 버튼 disabled', document.getElementById('btn-feed').classList.contains('disabled'));
ok('완주: 놀아주기 버튼 disabled', document.getElementById('btn-play').classList.contains('disabled'));
ok('완주: 탐험 버튼 활성 유지', !document.getElementById('btn-explore').classList.contains('disabled'));

// 3) 완주 탐험: SP만 소모, 스탯 소모 없음
var h0=state.hunger, hp0=state.health, sp0=state.sp;
startExplore();
ok('완주 탐험: SP 40 소모', state.sp===sp0-EXPLORE_SP);
ok('완주 탐험: 포만감 불변 ('+h0+'→'+state.hunger+')', state.hunger===h0);
ok('완주 탐험: 체력 불변 ('+hp0+'→'+state.health+')', state.health===hp0);
ok('완주 탐험: 친밀도 상한 유지 (1,880)', state.affection===STAGE_MAX);
ok('완주 탐험: 주간 횟수 소모', state.weeklyExplore===0);

// 4) 완주 일일 보상 불가
state.spUsedToday=DAILY_GIFT_SP; state.giftGiven=false;
var titleBefore=document.getElementById('rewardTitle').textContent;
showDailyGift();
ok('완주: 일일 보상 팝업 미표시', document.getElementById('rewardTitle').textContent===titleBefore);

// 5) 완주 일일 패널티 미적용 + SP 지급 유지
state.exploring=false;
var h1=state.hunger, hp1=state.health, sp1=state.sp;
nextDay();
ok('완주: 일일 패널티 미적용 (포만 '+h1+'→'+state.hunger+')', state.hunger===h1);
ok('완주: 일일 패널티 미적용 (체력 '+hp1+'→'+state.health+')', state.health===hp1);
ok('완주: 일일 SP 지급 유지 (+'+DAILY_SP+')', state.sp===sp1+DAILY_SP);

// ══════════════════════════════════════════════════════════
//  [D] 일반 단계에서는 기존 규칙 유지
// ══════════════════════════════════════════════════════════
console.log('\n[D] 일반 단계 규칙 유지 확인');
growthStage=5; state.affection=500; state.hunger=60; state.health=60;
var h2=state.hunger, hp2=state.health;
state.exploring=false; state.weeklyExplore=1; state.sp=200;
startExplore();
ok('일반 단계 탐험: 포만감 -25 적용', state.hunger===h2-25);
ok('일반 단계 탐험: 체력 -30 적용', state.health===hp2-30);

growthStage=5; state.exploring=false;
var h3=state.hunger, hp3=state.health;
nextDay();
ok('일반 단계: 일일 패널티 적용', state.hunger===h3-DAILY_PEN_HUNGER && state.health===hp3-DAILY_PEN_HEALTH);

// ══════════════════════════════════════════════════════════
//  [E] 새 밸런스 테이블 — 단계 판정 경계값
// ══════════════════════════════════════════════════════════
console.log('\n[E] 새 친밀도 테이블 단계 경계 판정');
function stageAt(aff){
  var cs=1;
  for(var s=MAX_STAGE;s>=1;s--){ if(aff>=STAGE_THR[s]){cs=s;break;} }
  return cs;
}
// 1단계는 누적 0 → 물주기 실행 시 1일차 시작 즉시 달성
ok('친밀도 0 → 1단계 (물주기 시 즉시 달성)', stageAt(0)===1);
ok('친밀도 79 → 1단계 유지', stageAt(79)===1);
ok('친밀도 80 → 2단계 (2일차 완료)', stageAt(80)===2);
ok('친밀도 279 → 2단계 유지', stageAt(279)===2);
ok('친밀도 280 → 3단계 (7일차 완료, 1주차 단거리)', stageAt(280)===3);
ok('친밀도 559 → 3단계 유지', stageAt(559)===3);
ok('친밀도 560 → 4단계 (14일차 완료, 2주차 중거리 해금)', stageAt(560)===4);
ok('친밀도 800 → 5단계 (20일차 완료)', stageAt(800)===5);
ok('친밀도 1,040 → 6단계 (26일차 완료)', stageAt(1040)===6);
ok('친밀도 1,320 → 7단계 (33일차 완료)', stageAt(1320)===7);
ok('친밀도 1,600 → 8단계 (40일차 완료)', stageAt(1600)===8);
ok('친밀도 1,879 → 8단계 유지 (완주 직전)', stageAt(1879)===8);
ok('친밀도 1,880 → 10단계 달성 (9단계 완료 즉시 만렙 = 완주)', stageAt(1880)===MAX_STAGE);
// 10단계는 구간 필요 친밀도가 0 이므로 9단계 표시 구간의 폭은 0 입니다.
// (누적 1,880 에서 9단계를 통과해 곧바로 10단계가 반환됩니다 — 기획서 [-] 규칙)
ok('9단계 표시 구간 폭 = 0 (STAGE_THR[9] === STAGE_THR[10])',
  STAGE_THR[9]===STAGE_THR[MAX_STAGE]);

// 기획서 표의 '누적 친밀도' 열과 STAGE_THR 이 정확히 일치 (시프트 없음)
var THR_SPEC={1:0,2:80,3:280,4:560,5:800,6:1040,7:1320,8:1600,9:1880,10:1880};
ok('STAGE_THR == 기획서 누적 친밀도 열 (시프트 없음)', (function(){
  for(var s=1;s<=MAX_STAGE;s++){ if(STAGE_THR[s]!==THR_SPEC[s]) return false; }
  return true;
})());

// 구간 필요 친밀도 = 기획서 기재값
var NEED_SPEC={1:0,2:80,3:200,4:280,5:240,6:240,7:280,8:280,9:280,10:0};
ok('STAGE_NEED == 기획서 구간 필요 친밀도 열', (function(){
  for(var s=1;s<=MAX_STAGE;s++){ if(STAGE_NEED[s]!==NEED_SPEC[s]) return false; }
  return true;
})());

ok('STAGE_NEED[1] = 0 (물주기로 즉시 달성, 체류 0일)', STAGE_NEED[1]===0);
ok('STAGE_NEED[10] = 0 (만렙 구간 요구치 없음 [-])', STAGE_NEED[MAX_STAGE]===0);
// 승급 = 완주 : 9단계 완료 누적 = 10단계 누적 = 친밀도 상한
ok('9단계 완료 누적 == 친밀도 상한 (1,880)', STAGE_THR[MAX_STAGE-1]===STAGE_MAX);
ok('10단계 달성 누적 == 친밀도 상한 (승급 = 완주, 1,880)', STAGE_THR[MAX_STAGE]===STAGE_MAX);
ok('8단계(1,600) + 280 = 9단계 완료 = 10단계 달성 = 1,880',
  STAGE_THR[8]+STAGE_NEED[9]===STAGE_MAX);
// 단계별 최대 체류 7일 (구간 필요 친밀도 <= 280)
ok('모든 단계 구간 필요 친밀도 <= 280 (체류 최대 7일)', (function(){
  for(var s=1;s<=MAX_STAGE;s++){ if(STAGE_NEED[s]>280) return false; }
  return true;
})());
// 초반 빠른 성장 구간 (2~3단계)
ok('2단계 구간 = 80 (체류 2일)', STAGE_NEED[2]===80);
ok('3단계 구간 = 200 (체류 5일, 7일차 완료)', STAGE_NEED[3]===200);
ok('구간 필요 총합 = 1,880', (function(){
  var t=0; for(var s=1;s<=MAX_STAGE;s++)t+=STAGE_NEED[s]; return t===STAGE_MAX;
})());
// 각 단계 달성 일차 = 누적 / 40 (일일 +40 기준)
var DAY_SPEC={1:0,2:2,3:7,4:14,5:20,6:26,7:33,8:40,9:47,10:47};
ok('각 단계 달성 일차 = 누적/40 (기획서 일치)', (function(){
  for(var s=1;s<=MAX_STAGE;s++){ if(STAGE_THR[s]/40!==DAY_SPEC[s]) return false; }
  return true;
})());
ok('10단계 달성(완주) 일차 = 47일차', STAGE_MAX/40===47);
ok('9단계 완료 일차 = 10단계 달성 일차 = 47일차',
  STAGE_THR[MAX_STAGE-1]/40===47 && STAGE_THR[MAX_STAGE]/40===47);
ok('3단계 완료 일차 = 7일차 (1주차 단거리 탐험)', STAGE_THR[3]/40===7);
ok('4단계 완료 일차 = 14일차 (2주차 중거리 해금)', STAGE_THR[4]/40===14);
ok('10단계 명칭 = 모코코 Lv.10 (만렙코코)', STAGE_NAMES[MAX_STAGE]==='모코코 Lv.10 (만렙코코)');

// ══════════════════════════════════════════════════════════
//  [F] 주차별 탐험 보상 획득 시점 — 탐험 구간 자동 결정
//      1~3단계 단거리 / 4~7단계 중거리 / 8~10단계 장거리
// ══════════════════════════════════════════════════════════
console.log('\n[F] 주차별 탐험 보상 획득 시점 (getExploreType)');
var WEEK_SPEC=[
  {week:1, day:7,  aff:280,  stage:3,  type:'short'},
  {week:2, day:14, aff:560,  stage:4,  type:'mid'},
  {week:3, day:21, aff:840,  stage:5,  type:'mid'},
  {week:4, day:28, aff:1120, stage:6,  type:'mid'},
  {week:5, day:35, aff:1400, stage:7,  type:'mid'},
  {week:6, day:42, aff:1680, stage:8,  type:'long'},
  {week:7, day:47, aff:1880, stage:10, type:'long'}
];
WEEK_SPEC.forEach(function(w){
  ok('  '+w.week+'주차 '+w.day+'일차: 누적 '+w.aff.toLocaleString()+' = 40 x '+w.day,
    w.aff===Math.min(40*w.day, STAGE_MAX));
  ok('  '+w.week+'주차 '+w.day+'일차: '+w.stage+'단계', stageAt(w.aff)===w.stage);
  // 실제 게임 로직의 getExploreType() 으로 탐험 구간 검증
  growthStage=w.stage;
  ok('  '+w.week+'주차 탐험 구간 = '+w.type, getExploreType()===w.type);
});
ok('1주차(7일차) = 3단계 완료 시점 단거리 탐험',
  STAGE_THR[3]/40===WEEK_SPEC[0].day && WEEK_SPEC[0].type==='short');
ok('2주차(14일차) = 4단계 진입 시점 중거리 해금',
  STAGE_THR[4]/40===WEEK_SPEC[1].day && WEEK_SPEC[1].type==='mid');
ok('7주차(47일차) = 만렙 도달 후 장거리 탐험 전용',
  WEEK_SPEC[6].aff===STAGE_MAX && WEEK_SPEC[6].type==='long');
// 단거리는 미지의 상자 없음 / 중·장거리는 미지의 상자 포함
ok('단거리 탐험: 미지의 상자 미포함', EXPLORE_DEF.short.box===false);
ok('중거리 탐험: 미지의 상자 포함', EXPLORE_DEF.mid.box===true);
ok('장거리 탐험: 미지의 상자 포함', EXPLORE_DEF.long.box===true);
// 탐험 구간 단계 경계가 기획 조건과 일치
ok('단거리 구간 = 1~3단계', EXPLORE_DEF.short.stageMin===1 && EXPLORE_DEF.short.stageMax===3);
ok('중거리 구간 = 4~7단계', EXPLORE_DEF.mid.stageMin===4 && EXPLORE_DEF.mid.stageMax===7);
ok('장거리 구간 = 8~10단계', EXPLORE_DEF.long.stageMin===8 && EXPLORE_DEF.long.stageMax===MAX_STAGE);

console.log('\n통과 '+pass+' / 실패 '+fail);
process.exit(fail===0?0:1);
