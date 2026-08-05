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
console.log('\n[6] 파생값 일관성');
// 1~9단계 구간 필요 친밀도 총합 = 9단계 완료 누적(1,880) = 친밀도 상한
var sumNeed = 0;
for (var i = 1; i < SPEC.MAX_STAGE; i++) sumNeed += SPEC.STAGE_NEED[i];
check('Σ STAGE_NEED(1~9) == STAGE_THR[9]', SPEC.STAGE_THR[SPEC.MAX_STAGE - 1], sumNeed);
check('Σ STAGE_NEED(1~9) == STAGE_MAX (9단계 완료 = 상한)', SPEC.STAGE_MAX, sumNeed);

// 10단계는 구간 필요 친밀도가 0이므로 총합은 그대로 1,880
var sumAll = sumNeed + SPEC.STAGE_NEED[SPEC.MAX_STAGE];
check('Σ STAGE_NEED(1~10) == STAGE_MAX', SPEC.STAGE_MAX, sumAll);
check('STAGE_NEED[1] == 0 (물주기로 즉시 달성)', 0, SPEC.STAGE_NEED[1]);
check('STAGE_NEED[10] == 0 (만렙 구간 요구치 없음 [-])', 0, SPEC.STAGE_NEED[SPEC.MAX_STAGE]);
// 9단계 완료(1,880) 즉시 10단계 도달 → 두 누적 임계값이 동일
check('STAGE_THR[9] == STAGE_THR[10] (9단계 완료 즉시 만렙)',
  SPEC.STAGE_THR[SPEC.MAX_STAGE - 1], SPEC.STAGE_THR[SPEC.MAX_STAGE]);
check('STAGE_THR[10] == STAGE_MAX (10단계 달성 = 완주)',
  SPEC.STAGE_MAX, SPEC.STAGE_THR[SPEC.MAX_STAGE]);
// 각 단계 누적 임계값이 STAGE_THR[s] = 표의 누적 친밀도 열과 일치 (시프트 없음)
var THR_SPEC = { 1:0, 2:80, 3:280, 4:560, 5:800, 6:1040, 7:1320, 8:1600, 9:1880, 10:1880 };
for (var ts = 1; ts <= SPEC.MAX_STAGE; ts++) {
  check('  기획서 누적 친밀도[' + ts + ']', THR_SPEC[ts], SPEC.STAGE_THR[ts]);
}
// 기획서 '구간 필요 친밀도' 열과 파생 STAGE_NEED 대조
var NEED_SPEC = { 1:0, 2:80, 3:200, 4:280, 5:240, 6:240, 7:280, 8:280, 9:280, 10:0 };
for (var ns = 1; ns <= SPEC.MAX_STAGE; ns++) {
  check('  기획서 구간 필요 친밀도[' + ns + ']', NEED_SPEC[ns], SPEC.STAGE_NEED[ns]);
}
// stageOf 경계 — 누적 1,880 에서 9단계를 통과해 10단계를 반환해야 함
check('stageOf(0) == 1 (물주기 시 즉시 달성)', 1, SIM.stageOf(0));
check('stageOf(1879) == 8 (9단계 진행 중)', 8, SIM.stageOf(SPEC.STAGE_MAX - 1));
check('stageOf(1880) == 10 (9단계 완료 즉시 만렙)', SPEC.MAX_STAGE, SIM.stageOf(SPEC.STAGE_MAX));

// 밸런스 테이블의 체류 일수 / 완료 일차 (일일 +40 기준) 역산 검증
console.log('\n[7] 밸런스 테이블 체류·완료 일차 (일일 친밀도 +40 기준)');
for (var s = 1; s <= SPEC.MAX_STAGE; s++) {
  var dwell = SPEC.STAGE_NEED[s] / 40;
  check('  ' + s + '단계 체류 일수', SPEC.STAGE_DWELL[s], dwell);
}
for (var s2 = 2; s2 <= SPEC.MAX_STAGE; s2++) {
  // 달성 일차 = 해당 단계 누적 친밀도 / 일일 +40
  check('  ' + s2 + '단계 달성 일차', SPEC.STAGE_DONE_DAY[s2], SPEC.STAGE_THR[s2] / 40);
}
check('최종 완주 일차 = 47일차', 47, SPEC.STAGE_MAX / 40);
check('9단계 완료 일차 == 완주 일차 (47일차)', SPEC.STAGE_DONE_DAY[SPEC.MAX_STAGE - 1], SPEC.STAGE_MAX / 40);
check('10단계 달성 일차 == 완주 일차', SPEC.STAGE_DONE_DAY[SPEC.MAX_STAGE], SPEC.STAGE_MAX / 40);
check('10단계 체류 기간 == 0 (만렙 체류 없음 [-])', 0, SPEC.STAGE_DWELL[SPEC.MAX_STAGE]);
// 초반 빠른 성장 / 중·후반 최대 7일 이내 체류 규칙
check('3단계 완료 일차 = 7일차 (1주차 단거리 탐험)', 7, SPEC.STAGE_DONE_DAY[3]);
check('4단계 완료 일차 = 14일차 (2주차 중거리 해금)', 14, SPEC.STAGE_DONE_DAY[4]);
var maxDwell = 0;
for (var dw = 1; dw <= SPEC.MAX_STAGE; dw++) {
  if (SPEC.STAGE_DWELL[dw] > maxDwell) maxDwell = SPEC.STAGE_DWELL[dw];
}
check('단계별 최대 체류 기간 <= 7일', true, maxDwell <= 7);

// 9단계 완료(1,880) 즉시 10단계 도달 = 완주 (동일 시점)
console.log('\n  \u2139 9단계 완료 = 10단계 달성 = 완주 = ' + SPEC.STAGE_MAX.toLocaleString() +
  ' (' + SPEC.STAGE_DONE_DAY[SPEC.MAX_STAGE] + '일차, 일일 +40 기준)');
console.log('     10단계 구간 체류 기간 [-] / 구간 필요 친밀도 [-] → 도달 즉시 탐험 전용 전환');

// ── 주차별 탐험 보상 획득 시점 테이블 ──
console.log('\n[8] 주차별 탐험 보상 획득 시점 테이블');
function tierOf(stage) { return stage >= 8 ? 'long' : (stage >= 4 ? 'mid' : 'short'); }
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
// 기획 조건: 1주차 단거리 = 7일차(3단계 완료) / 2주차 중거리 해금 = 14일차(4단계 진입)
check('1주차 탐험 수행 일차 = 7일차', 7, SPEC.EXPLORE_SCHEDULE[0].exploreDay);
check('1주차 탐험 구간 = 단거리', 'short', SPEC.EXPLORE_SCHEDULE[0].tier);
check('1주차 = 3단계 완료 시점', SPEC.STAGE_DONE_DAY[3], SPEC.EXPLORE_SCHEDULE[0].exploreDay);
check('2주차 탐험 수행 일차 = 14일차', 14, SPEC.EXPLORE_SCHEDULE[1].exploreDay);
check('2주차 탐험 구간 = 중거리 (해금)', 'mid', SPEC.EXPLORE_SCHEDULE[1].tier);
check('2주차 = 4단계 완료 시점', SPEC.STAGE_DONE_DAY[4], SPEC.EXPLORE_SCHEDULE[1].exploreDay);
check('7주차 탐험 수행 일차 = 47일차 (완주)', SPEC.STAGE_MAX / 40, SPEC.EXPLORE_SCHEDULE[6].exploreDay);
check('7주차 = 10단계 (만렙 탐험 전용)', SPEC.MAX_STAGE, SPEC.EXPLORE_SCHEDULE[6].stage);
// index.html 의 getExploreType 단계 경계가 스케줄 tier 규칙과 동일한지
check('index.html getExploreType 장거리 경계 (>=8)',
  true, /growthStage\s*>=\s*8\s*\)\s*return\s*'long'/.test(html));
check('index.html getExploreType 중거리 경계 (>=4)',
  true, /growthStage\s*>=\s*4\s*\)\s*return\s*'mid'/.test(html));
check('index.html 주차별 탐험 보상 획득 시점 테이블 주석 존재',
  true, /주차별 탐험 보상 획득 시점 테이블/.test(html));

// 실제 도달 가능성 및 일차 재확인
var chk = SIM.simulate({ strategy: 'intended', days: 120 });
check('친밀도 상한 도달 가능 (데드엔드 없음)', false, chk.stats.deadEnd);
check('1,880 완주 달성', true, chk.completeDay !== null);
check('완주 일차 == 47일차 (시뮬레이션)', 47, chk.completeDay);
check('완주 일차 == STAGE_DONE_DAY[10] (시뮬레이션)',
  SPEC.STAGE_DONE_DAY[SPEC.MAX_STAGE], chk.completeDay);
check('10단계 승급 일차 == 47일차 (시뮬레이션)', 47, chk.maxLevelDay);
check('승급 == 완주 (동일 일차)', 0, chk.completeDay - chk.maxLevelDay);
check('9단계 완료 일차 == 10단계 달성 일차 (시뮬레이션)',
  chk.levelDays[SPEC.MAX_STAGE], chk.levelDays[SPEC.MAX_STAGE - 1]);
// 단계별 달성 일차가 기획서 표와 완전히 일치하는지 (시뮬레이션 실측)
for (var ls = 2; ls <= SPEC.MAX_STAGE; ls++) {
  check('  ' + ls + '단계 달성 일차 (시뮬레이션)', SPEC.STAGE_DONE_DAY[ls], chk.levelDays[ls]);
}
check('  1단계 달성 일차 (시뮬레이션) = 1일차', 1, chk.levelDays[1]);
check('최종 친밀도 == STAGE_MAX (시뮬레이션)', SPEC.STAGE_MAX, chk.finalAffection);

console.log('\n' + '─'.repeat(50));
console.log('  통과 ' + pass + ' / 실패 ' + fail);
console.log('─'.repeat(50) + '\n');
process.exit(fail === 0 ? 0 : 1);
