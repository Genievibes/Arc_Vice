#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
 *  sim-engine.js 의 수치가 index.html 의 실제 게임 로직과 일치하는지 검증
 *
 *  시뮬레이터가 본 게임과 다른 수치를 쓰면 분석 결과가 전부 무의미해지므로,
 *  index.html 에서 상수를 직접 파싱해 대조합니다.
 *
 *  사용법: node tools/verify-sync.js
 * ═══════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs');
var path = require('path');
var SIM = require('../sim-engine.js');
var SPEC = SIM.SPEC;

var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var pass = 0, fail = 0;
function check(label, expected, actual) {
  var ok = String(expected) === String(actual);
  if (ok) { pass++; console.log('  ✅ ' + label + ' = ' + actual); }
  else { fail++; console.log('  ❌ ' + label + ' : index.html=' + expected + ' / sim-engine=' + actual); }
}

// ── 스칼라 상수 파싱 ──
function num(name) {
  var m = html.match(new RegExp('var\\s+' + name + '\\s*=\\s*(-?\\d+)'));
  if (!m) throw new Error('index.html 에서 ' + name + ' 을 찾을 수 없습니다');
  return parseInt(m[1], 10);
}

console.log('\n[1] 기본 상수');
check('DAILY_SP',         num('DAILY_SP'),         SPEC.DAILY_SP);
check('STAGE_MAX',        num('STAGE_MAX'),        SPEC.STAGE_MAX);
check('HUNGER_INIT',      num('HUNGER_INIT'),      SPEC.HUNGER_INIT);
check('HEALTH_INIT',      num('HEALTH_INIT'),      SPEC.HEALTH_INIT);
check('STAT_MAX',         num('STAT_MAX'),         SPEC.STAT_MAX);
check('DAILY_PEN_HUNGER', num('DAILY_PEN_HUNGER'), SPEC.DAILY_PEN_HUNGER);
check('DAILY_PEN_HEALTH', num('DAILY_PEN_HEALTH'), SPEC.DAILY_PEN_HEALTH);
check('MAX_STAGE',        num('MAX_STAGE'),        SPEC.MAX_STAGE);
check('EXPLORE_SP',       num('EXPLORE_SP'),       SPEC.EXPLORE.sp);

// ── ACTIONS 파싱 ──
console.log('\n[2] 상호작용 (ACTIONS)');
function action(key) {
  var m = html.match(new RegExp(key + '\\s*:\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error('ACTIONS.' + key + ' 파싱 실패');
  var body = m[1], o = {};
  ['sp', 'hunger', 'health', 'affection'].forEach(function (f) {
    var mm = body.match(new RegExp(f + '\\s*:\\s*([+-]?\\d+)'));
    o[f] = mm ? parseInt(mm[1], 10) : null;
  });
  o.dailyOnce = /dailyOnce\s*:\s*true/.test(body);
  return o;
}
['feed', 'play'].forEach(function (k) {
  var a = action(k), b = SPEC.ACTIONS[k];
  check(k + '.sp',        a.sp,        b.sp);
  check(k + '.hunger',    a.hunger,    b.hunger);
  check(k + '.health',    a.health,    b.health);
  check(k + '.affection', a.affection, b.affection);
  check(k + '.dailyOnce', a.dailyOnce, b.dailyOnce);
});

// ── 탐험 스탯 변화 (EXPLORE_DEF 3구간 모두 동일해야 함) ──
console.log('\n[3] 탐험 스탯 변화');
var hungers = (html.match(/hunger\s*:\s*-25/g) || []).length;
var healths = (html.match(/health\s*:\s*-30/g) || []).length;
check('탐험 hunger:-25 구간 수 (3구간)', 3, hungers);
check('탐험 health:-30 구간 수 (3구간)', 3, healths);
check('탐험 hunger', -25, SPEC.EXPLORE.hunger);
check('탐험 health', -30, SPEC.EXPLORE.health);
var expAff = html.match(/affection\s*\+\s*40\s*,\s*0\s*,\s*STAGE_MAX/);
check('탐험 친밀도 +40 (startExplore)', true, !!expAff);
check('탐험 친밀도 (sim)', 40, SPEC.EXPLORE.affection);

// ── STAGE_THR 파싱 ──
console.log('\n[4] 성장 단계 누적 임계값 (STAGE_THR)');
var thrBlock = html.match(/var\s+STAGE_THR\s*=\s*\{([\s\S]*?)\}/);
if (!thrBlock) throw new Error('STAGE_THR 파싱 실패');
var thr = {};
thrBlock[1].replace(/(\d+)\s*:\s*(\d+)/g, function (_, k, v) { thr[+k] = +v; return ''; });
for (var s = 1; s <= SPEC.MAX_STAGE; s++) check('STAGE_THR[' + s + ']', thr[s], SPEC.STAGE_THR[s]);

// ── 완주(1,880) 이후 분기 로직 ──
console.log('\n[5] 핵심 분기 로직');
// 완주 이후 규칙 (기획 확정): SP 지급 유지 / 패널티 미적용 /
//   먹이기·놀아주기 비활성 / 일일 보상 불가 / 탐험 유지(SP만 소모)
// ※ 9단계 완료(1,880) 즉시 10단계 도달 = 완주 → isCompleted()는 STAGE_MAX 기준
check('완주 판정 함수(isCompleted)가 STAGE_MAX 기준',
  true, /function\s+isCompleted\s*\(\s*\)\s*\{[\s\S]{0,80}state\.affection\s*>=\s*STAGE_MAX/.test(html));
check('완주 이후에도 일일 SP 지급 유지',
  true, /완주 이후에도 계속 지급[\s\S]{0,60}state\.sp\s*\+=\s*DAILY_SP/.test(html));
check('SP 지급 중단 코드 제거됨 (단계 기준)',
  false, /if\s*\(\s*growthStage\s*<\s*MAX_STAGE\s*\)\s*state\.sp\s*\+=\s*DAILY_SP/.test(html));
check('일일 페널티 0단계·완주 예외',
  true, /growthStage\s*>=\s*1\s*&&\s*!isCompleted\(\)/.test(html));
check('완주 시 먹이기·놀아주기 차단',
  true, /if\s*\(\s*eventEnded\s*\|\|\s*isCompleted\(\)\s*\)/.test(html));
check('완주 시 일일 보상 차단 (showDailyGift)',
  true, /if\s*\(\s*isCompleted\(\)\s*\)\s*return;/.test(html));
check('완주 시 일일 보상 차단 (탐험 경로)',
  true, /!wasCompleted\s*&&\s*state\.spUsedToday\s*>=\s*DAILY_GIFT_SP/.test(html));
check('완주 이후 탐험은 스탯 소모 미적용',
  true, /if\s*\(\s*!wasCompleted\s*\)\s*\{\s*state\.hunger\s*=\s*clamp\s*\(\s*state\.hunger\s*\+\s*def\.hunger/.test(html));
check('종료 처리는 checkCompletion() 경유 (인라인 종료 없음)',
  false, /if\s*\(\s*newStage\s*===\s*MAX_STAGE\s*&&\s*!eventEnded\s*\)/.test(html));
check('완주 판정 훅(checkCompletion) 존재',
  true, /function\s+checkCompletion\s*\(/.test(html));
check('체력 0 시 행동 제한 존재',
  true, /state\.health\s*<=\s*0/.test(html));

// ── 파생 일관성 ──
console.log('\n[6] 파생값 일관성 (진입 친밀도 기준)');
// 1~9단계 구간 필요 친밀도 총합 = 10단계 진입 친밀도(1,880) = 친밀도 상한
var sumNeed = 0;
for (var i = 1; i < SPEC.MAX_STAGE; i++) sumNeed += SPEC.STAGE_NEED[i];
check('Σ STAGE_NEED(1~9) == STAGE_THR[10]', SPEC.STAGE_THR[SPEC.MAX_STAGE], sumNeed);
check('Σ STAGE_NEED(1~9) == STAGE_MAX (10단계 진입 = 상한)', SPEC.STAGE_MAX, sumNeed);

// 10단계는 구간 필요 친밀도가 0이므로 총합은 그대로 1,880
var sumAll = sumNeed + SPEC.STAGE_NEED[SPEC.MAX_STAGE];
check('Σ STAGE_NEED(1~10) == STAGE_MAX', SPEC.STAGE_MAX, sumAll);
check('STAGE_NEED[10] == 0 (만렙 구간 요구치 없음 [-])', 0, SPEC.STAGE_NEED[SPEC.MAX_STAGE]);
// 진입 친밀도 사슬: THR[s] = THR[s-1] + NEED[s-1]
for (var cs2 = 2; cs2 <= SPEC.MAX_STAGE; cs2++) {
  check('  진입 사슬 THR[' + cs2 + '] == THR[' + (cs2 - 1) + '] + NEED[' + (cs2 - 1) + ']',
    SPEC.STAGE_THR[cs2], SPEC.STAGE_THR[cs2 - 1] + SPEC.STAGE_NEED[cs2 - 1]);
}
// 9단계와 10단계는 별개 구간 (280 폭)
check('STAGE_THR[9] != STAGE_THR[10] (9단계 실구간 존재)',
  true, SPEC.STAGE_THR[SPEC.MAX_STAGE - 1] !== SPEC.STAGE_THR[SPEC.MAX_STAGE]);
check('STAGE_THR[10] - STAGE_THR[9] == STAGE_NEED[9] (280)',
  SPEC.STAGE_NEED[SPEC.MAX_STAGE - 1],
  SPEC.STAGE_THR[SPEC.MAX_STAGE] - SPEC.STAGE_THR[SPEC.MAX_STAGE - 1]);
check('STAGE_THR[10] == STAGE_MAX (10단계 진입 = 완주)',
  SPEC.STAGE_MAX, SPEC.STAGE_THR[SPEC.MAX_STAGE]);
// 각 단계 진입 친밀도가 기획서 표의 '진입 친밀도' 열과 일치 (시프트 없음)
var THR_SPEC = { 1:0, 2:40, 3:120, 4:280, 5:560, 6:800, 7:1040, 8:1320, 9:1600, 10:1880 };
for (var ts = 1; ts <= SPEC.MAX_STAGE; ts++) {
  check('  기획서 진입 친밀도[' + ts + ']', THR_SPEC[ts], SPEC.STAGE_THR[ts]);
}
// 기획서 '구간 필요' 열과 파생 STAGE_NEED 대조
var NEED_SPEC = { 1:40, 2:80, 3:160, 4:280, 5:240, 6:240, 7:280, 8:280, 9:280, 10:0 };
for (var ns = 1; ns <= SPEC.MAX_STAGE; ns++) {
  check('  기획서 구간 필요[' + ns + ']', NEED_SPEC[ns], SPEC.STAGE_NEED[ns]);
}
// 기획서 '하트 1개당' 열 = 구간 필요 / 5
var HEART_SPEC = { 1:8, 2:16, 3:32, 4:56, 5:48, 6:48, 7:56, 8:56, 9:56, 10:0 };
for (var hs = 1; hs <= SPEC.MAX_STAGE; hs++) {
  check('  기획서 하트 1개당[' + hs + ']', HEART_SPEC[hs], SPEC.HEART_PER[hs]);
  check('  하트 1개당 x 5 == 구간 필요[' + hs + ']', SPEC.STAGE_NEED[hs], SPEC.HEART_PER[hs] * 5);
}
// stageOf 경계 — 진입 친밀도 기준 역방향 스캔
check('stageOf(0) == 1 (진입치 0, 튜토리얼 직후)', 1, SIM.stageOf(0));
check('stageOf(39) == 1 (2단계 진입 전)', 1, SIM.stageOf(39));
check('stageOf(40) == 2 (2단계 진입)', 2, SIM.stageOf(40));
check('stageOf(119) == 2', 2, SIM.stageOf(119));
check('stageOf(120) == 3 (3단계 진입)', 3, SIM.stageOf(120));
check('stageOf(1599) == 8 (9단계 진입 전)', 8, SIM.stageOf(1599));
check('stageOf(1600) == 9 (9단계 진입)', 9, SIM.stageOf(1600));
check('stageOf(1879) == 9 (9단계 진행 중)', 9, SIM.stageOf(SPEC.STAGE_MAX - 1));
check('stageOf(1880) == 10 (만렙 완주)', SPEC.MAX_STAGE, SIM.stageOf(SPEC.STAGE_MAX));
// 밸런스 테이블의 체류 일수 / 완료 일차 (일일 +40 기준) 역산 검증
console.log('\n[7] 밸런스 테이블 체류·진입 일차 (일일 친밀도 +40 기준)');
for (var s = 1; s <= SPEC.MAX_STAGE; s++) {
  var dwell = SPEC.STAGE_NEED[s] / 40;
  check('  ' + s + '단계 체류 일수', SPEC.STAGE_DWELL[s], dwell);
  check('  ' + s + '단계 체류 일수 정수', true, dwell === Math.floor(dwell));
}
for (var s2 = 1; s2 <= SPEC.MAX_STAGE; s2++) {
  // 진입 일차 = 해당 단계 진입 친밀도 / 일일 +40
  check('  ' + s2 + '단계 진입 일차', SPEC.STAGE_ENTRY_DAY[s2], SPEC.STAGE_THR[s2] / 40);
}
check('최종 완주 일차 = 47일차', 47, SPEC.STAGE_MAX / 40);
check('10단계 진입 일차 == 완주 일차 (47일차)', SPEC.STAGE_ENTRY_DAY[SPEC.MAX_STAGE], SPEC.STAGE_MAX / 40);
check('9단계 진입 일차 = 40일차', 40, SPEC.STAGE_ENTRY_DAY[SPEC.MAX_STAGE - 1]);
check('10단계 체류 기간 == 0 (만렙 체류 없음 [-])', 0, SPEC.STAGE_DWELL[SPEC.MAX_STAGE]);
// 기획서 명시 진입 일차
check('1단계 진입 일차 = 0일차 (튜토리얼 직후)', 0, SPEC.STAGE_ENTRY_DAY[1]);
check('2단계 진입 일차 = 1일차 (1~2일 차 체류)', 1, SPEC.STAGE_ENTRY_DAY[2]);
check('3단계 진입 일차 = 3일차', 3, SPEC.STAGE_ENTRY_DAY[3]);
check('4단계 진입 일차 = 7일차 (1주차 단거리 탐험)', 7, SPEC.STAGE_ENTRY_DAY[4]);
check('5단계 진입 일차 = 14일차 (2주차 중거리 해금)', 14, SPEC.STAGE_ENTRY_DAY[5]);
check('6단계 진입 일차 = 20일차', 20, SPEC.STAGE_ENTRY_DAY[6]);
check('7단계 진입 일차 = 26일차', 26, SPEC.STAGE_ENTRY_DAY[7]);
check('8단계 진입 일차 = 33일차', 33, SPEC.STAGE_ENTRY_DAY[8]);
var maxDwell = 0;
for (var dw = 4; dw <= SPEC.MAX_STAGE; dw++) {
  if (SPEC.STAGE_DWELL[dw] > maxDwell) maxDwell = SPEC.STAGE_DWELL[dw];
}
check('4~10단계 최대 체류 기간 <= 7일', true, maxDwell <= 7);

// 10단계 진입(1,880) = 완주 (동일 시점)
console.log('\n  \u2139 10단계 진입 = 완주 = ' + SPEC.STAGE_MAX.toLocaleString() +
  ' (' + SPEC.STAGE_ENTRY_DAY[SPEC.MAX_STAGE] + '일차, 일일 +40 기준)');
console.log('     10단계 구간 체류 기간 [-] / 구간 필요 친밀도 [-] → 진입 즉시 탐험 전용 전환 (하트 5개 고정)');
check('EXPLORE_SCHEDULE 정의됨 (7주차)', 7, SPEC.EXPLORE_SCHEDULE.length);
console.log('\n[8] 주차별 탐험 보상 획득 시점 테이블');
function tierOf(stage) { return stage >= 9 ? 'long' : (stage >= 5 ? 'mid' : 'short'); }
check('EXPLORE_SCHEDULE 정의됨 (7주차)', 7, SPEC.EXPLORE_SCHEDULE.length);
SPEC.EXPLORE_SCHEDULE.forEach(function (w) {
  // 주차 경계: n주차 = (n-1)*7+1 ~ n*7 일차
  check('  ' + w.week + '주차 일차 구간 시작', (w.week - 1) * 7 + 1, w.dayFrom);
  check('  ' + w.week + '주차 일차 구간 종료', w.week * 7, w.dayTo);
  // 누적 친밀도 = 40 x 탐험 수행 일차 (상한 1,880)
  check('  ' + w.week + '주차 누적 친밀도',
    Math.min(SPEC.DAILY_SP * w.exploreDay, SPEC.STAGE_MAX), w.affection);
  // 성장 단계는 누적 친밀도에서 역산되어야 함
  check('  ' + w.week + '주차 성장 단계', SIM.stageOf(w.affection), w.stage);
  // 탐험 구간(단/중/장거리)은 성장 단계에서 결정 (index.html getExploreType 과 동일 규칙)
  check('  ' + w.week + '주차 탐험 구간', tierOf(w.stage), w.tier);
});
// 기획 조건: 1주차 단거리 = 7일차(4단계 진입) / 2주차 중거리 해금 = 14일차(5단계 진입)
check('1주차 탐험 수행 일차 = 7일차', 7, SPEC.EXPLORE_SCHEDULE[0].exploreDay);
check('1주차 탐험 구간 = 단거리', 'short', SPEC.EXPLORE_SCHEDULE[0].tier);
check('1주차 = 4단계 진입 시점', SPEC.STAGE_ENTRY_DAY[4], SPEC.EXPLORE_SCHEDULE[0].exploreDay);
check('2주차 탐험 수행 일차 = 14일차', 14, SPEC.EXPLORE_SCHEDULE[1].exploreDay);
check('2주차 탐험 구간 = 중거리 (해금)', 'mid', SPEC.EXPLORE_SCHEDULE[1].tier);
check('2주차 = 5단계 진입 시점', SPEC.STAGE_ENTRY_DAY[5], SPEC.EXPLORE_SCHEDULE[1].exploreDay);
check('6주차 탐험 구간 = 장거리 (9단계)', 'long', SPEC.EXPLORE_SCHEDULE[5].tier);
check('6주차 = 9단계', 9, SPEC.EXPLORE_SCHEDULE[5].stage);
check('7주차 탐험 수행 일차 = 47일차 (완주)', SPEC.STAGE_MAX / 40, SPEC.EXPLORE_SCHEDULE[6].exploreDay);
check('7주차 = 10단계 (만렙 탐험 전용)', SPEC.MAX_STAGE, SPEC.EXPLORE_SCHEDULE[6].stage);
// index.html 의 getExploreType 단계 경계가 스케줄 tier 규칙과 동일한지
check('index.html getExploreType 장거리 경계 (>=9)',
  true, /growthStage\s*>=\s*9\s*\)\s*return\s*'long'/.test(html));
check('index.html getExploreType 중거리 경계 (>=5)',
  true, /growthStage\s*>=\s*5\s*\)\s*return\s*'mid'/.test(html));
check('index.html EXPLORE_DEF 단거리 범위 (1~4)',
  true, /stageMin:\s*1,\s*stageMax:\s*4/.test(html));
check('index.html EXPLORE_DEF 중거리 범위 (5~8)',
  true, /stageMin:\s*5,\s*stageMax:\s*8/.test(html));
check('index.html EXPLORE_DEF 장거리 범위 (9~10)',
  true, /stageMin:\s*9,\s*stageMax:\s*10/.test(html));
check('index.html 주차별 탐험 보상 획득 시점 테이블 주석 존재',
  true, /주차별 탐험 보상 획득 시점 테이블/.test(html));
check('index.html HEART_PER 파생 상수 존재',
  true, /var\s+HEART_PER\s*=\s*\(function/.test(html));
check('index.html 하트 진행도가 STAGE_NEED 기반',
  true, /var\s+need\s*=\s*STAGE_NEED\[cs\]\s*\|\|\s*0;/.test(html));
var chk = SIM.simulate({ strategy: 'intended', days: 120 });
var chk = SIM.simulate({ strategy: 'intended', days: 120 });
check('친밀도 상한 도달 가능 (데드엔드 없음)', false, chk.stats.deadEnd);
check('1,880 완주 달성', true, chk.completeDay !== null);
check('완주 일차 == 47일차 (시뮬레이션)', 47, chk.completeDay);
check('완주 일차 == STAGE_ENTRY_DAY[10] (시뮬레이션)',
  SPEC.STAGE_ENTRY_DAY[SPEC.MAX_STAGE], chk.completeDay);
check('10단계 진입 일차 == 47일차 (시뮬레이션)', 47, chk.maxLevelDay);
check('진입 == 완주 (동일 일차)', 0, chk.completeDay - chk.maxLevelDay);
check('9단계 진입 일차 = 40일차 (시뮬레이션)', 40, chk.levelDays[SPEC.MAX_STAGE - 1]);
check('9단계 → 10단계 마지막 구간 7일 (시뮬레이션)',
  7, chk.levelDays[SPEC.MAX_STAGE] - chk.levelDays[SPEC.MAX_STAGE - 1]);
// 단계별 진입 일차가 기획서 표와 일치하는지 (시뮬레이션 실측, 3단계 이상)
//  ※ 1·2단계는 1일차 첫 +40으로 동시에 통과하므로 둘 다 1일차로 기록됩니다.
for (var ls = 3; ls <= SPEC.MAX_STAGE; ls++) {
  check('  ' + ls + '단계 진입 일차 (시뮬레이션)', SPEC.STAGE_ENTRY_DAY[ls], chk.levelDays[ls]);
}
check('  1단계 진입 일차 (시뮬레이션) = 1일차', 1, chk.levelDays[1]);
check('  2단계 진입 일차 (시뮬레이션) = 1일차 (첫날 +40 도달)', 1, chk.levelDays[2]);
check('최종 친밀도 == STAGE_MAX (시뮬레이션)', SPEC.STAGE_MAX, chk.finalAffection);
check('최종 단계 == 10단계 (시뮬레이션)', SPEC.MAX_STAGE, chk.finalStage);

console.log('\n' + '\u2500'.repeat(50));
console.log('  통과 ' + pass + ' / 실패 ' + fail);
console.log('\u2500'.repeat(50) + '\n');
process.exit(fail === 0 ? 0 : 1);
