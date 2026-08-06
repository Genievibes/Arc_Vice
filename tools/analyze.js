#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
 *  아크바이스 이벤트 — 밸런스 / 불쾌감성 분석 CLI
 *
 *  사용법:
 *    node tools/analyze.js            # 전 전략 비교 리포트
 *    node tools/analyze.js --days 90  # 기간 지정
 *    node tools/analyze.js --table intended   # 특정 전략 일자별 표
 * ═══════════════════════════════════════════════════════════════════ */
'use strict';
var SIM = require('../sim-engine.js');
var SPEC = SIM.SPEC;

var argv = process.argv.slice(2);
function arg(name, def) {
  var i = argv.indexOf('--' + name);
  return i === -1 ? def : argv[i + 1];
}
var DAYS = parseInt(arg('days', 70), 10);
var TABLE = arg('table', null);

function hr(t) { console.log('\n' + '═'.repeat(72)); if (t) console.log('  ' + t); console.log('═'.repeat(72)); }
function pad(s, n, right) {
  s = String(s);
  // 한글은 폭 2로 계산
  var w = 0; for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2000 ? 2 : 1;
  var sp = ' '.repeat(Math.max(0, n - w));
  return right ? sp + s : s + sp;
}

// ───────────────────────────────────────────────
//  단일 전략 일자별 표
// ───────────────────────────────────────────────
if (TABLE) {
  var r = SIM.simulate({ strategy: TABLE, days: DAYS });
  hr('일자별 로그 — ' + r.strategyName);
  console.log(pad('DAY', 6) + pad('요일', 6) + pad('Lv', 5) + pad('친밀도', 9, true) +
              pad('  포만', 8, true) + pad('체력', 7, true) + pad('SP사용', 9, true) +
              pad('SP잔량', 9, true) + '  행동');
  console.log('─'.repeat(72));
  r.rows.forEach(function (x) {
    var mark = x.leveledUp ? ' ★UP' : (x.danger ? ' !위험' : (x.idle ? ' ·무행동' : ''));
    console.log(pad(x.day, 6) + pad(x.dayName, 6) + pad(x.stage, 5) +
      pad(x.affection, 9, true) + pad(x.hunger, 8, true) + pad(x.health, 7, true) +
      pad(x.spSpent + 'P', 9, true) + pad(x.spLeft + 'P', 9, true) +
      '  ' + (x.actions.join(' · ') || '-') + mark);
  });
  process.exit(0);
}

// ───────────────────────────────────────────────
//  [A] 행동 효율
// ───────────────────────────────────────────────
hr('[A] 행동별 친밀도 효율 (친밀도 ÷ 소모 SP)');
var eff = SIM.efficiency();
[['먹이기', SPEC.ACTIONS.feed.sp, SPEC.ACTIONS.feed.affection, eff.feed],
 ['놀아주기', SPEC.ACTIONS.play.sp, SPEC.ACTIONS.play.affection, eff.play],
 ['탐험', SPEC.EXPLORE.sp, SPEC.EXPLORE.affection, eff.explore]
].forEach(function (a) {
  console.log('  ' + pad(a[0], 10) + pad(a[1] + 'P', 7, true) + ' → 친밀도 ' +
    pad('+' + a[2], 5, true) + '   효율 ' + a[3].toFixed(2) + ' /P');
});
console.log('\n  ⚠ 놀아주기가 먹이기보다 ' + (eff.play / eff.feed).toFixed(1) + '배 효율적입니다.');
console.log('     동일 30P: 먹이기 1회(+20) vs 놀아주기 3회(+60)');

// ───────────────────────────────────────────────
//  [B] 성장 단계 구조
// ───────────────────────────────────────────────
hr('[B] 성장 단계 구조');
console.log('  단계  ' + pad('명칭', 26) + pad('진입 친밀도', 13, true) +
  pad('구간 필요', 11, true) + pad('하트 1개당', 12, true));
for (var s = 1; s <= SPEC.MAX_STAGE; s++) {
  var isM = (s === SPEC.MAX_STAGE);
  console.log('  ' + pad(s, 6) + pad(SPEC.STAGE_NAMES[s], 26) +
    pad(SPEC.STAGE_THR[s].toLocaleString(), 13, true) +
    pad(isM ? '-' : SPEC.STAGE_NEED[s], 11, true) +
    pad(isM ? '-' : SPEC.HEART_PER[s], 12, true));
}
var sumNeed = 0; for (var k = 1; k < SPEC.MAX_STAGE; k++) sumNeed += SPEC.STAGE_NEED[k];
var sumAll = sumNeed + SPEC.STAGE_NEED[SPEC.MAX_STAGE];
console.log('\n  1~9단계 구간 필요 총합 = ' + sumNeed.toLocaleString() +
            ' = 10단계 진입 친밀도 ' + SPEC.STAGE_THR[SPEC.MAX_STAGE].toLocaleString() +
            ' = 친밀도 상한 ' + SPEC.STAGE_MAX.toLocaleString());
console.log('  10단계 구간 필요 친밀도 [-] (0) \u2192 총합 그대로 ' + sumAll.toLocaleString());
console.log('  \u203b 10단계 진입(' + SPEC.STAGE_MAX.toLocaleString() + ') = 만렙 완주' +
            ' (' + SPEC.STAGE_ENTRY_DAY[SPEC.MAX_STAGE] + '일차)' +
            ' \u2014 STAGE_THR[10] === STAGE_MAX');
console.log('  \u203b 10단계(만렙코코)는 구간 필요 친밀도·하트 1개당 수치가 없습니다 [-] (하트 5개 고정).');
console.log('  \u203b 하트 1개당 = 구간 필요 \u00f7 5 \u2192 8/16/32/56/48/48/56/56/56');

console.log('\n  단계  체류(일)  구간필요  하트1개당  진입일차   [일일 +40 기준]');
for (var s3 = 1; s3 <= SPEC.MAX_STAGE; s3++) {
  // 10단계는 체류 기간·구간 필요·하트 1개당이 없으므로 기획서와 동일하게 [-] 표기
  var isMax = (s3 === SPEC.MAX_STAGE);
  console.log('  ' + pad(s3, 6) +
    pad(isMax ? '-' : SPEC.STAGE_DWELL[s3], 9, true) +
    pad(isMax ? '-' : SPEC.STAGE_NEED[s3], 10, true) +
    pad(isMax ? '-' : SPEC.HEART_PER[s3], 11, true) +
    pad((SPEC.STAGE_ENTRY_DAY[s3] || 0) + '일차', 10, true));
}

// ── 주차별 탐험 보상 획득 시점 테이블 ──
console.log('\n  [주차별 탐험 보상 획득 시점]  (일일 +40 정속 성장 기준)');
console.log('  ' + pad('주차', 7) + pad('일차 구간', 13) + pad('탐험일차', 10, true) +
  pad('누적', 9, true) + pad('단계', 7, true) + pad('탐험 구간', 11, true) + '  보상');
SPEC.EXPLORE_SCHEDULE.forEach(function (w) {
  console.log('  ' + pad(w.week + '주차', 7) +
    pad(w.dayFrom + '~' + w.dayTo + '일차', 13) +
    pad(w.exploreDay + '일차', 10, true) +
    pad(w.affection.toLocaleString(), 9, true) +
    pad(w.stage + '단계', 7, true) +
    pad(w.tierName, 11, true) + '  ' + w.reward);
});
console.log('  \u203b 1주차 단거리 = 4단계 진입(7일차) / 2주차 중거리 해금 = 5단계 진입(14일차)');
console.log('  \u203b 6주차 장거리 = 9단계 진입 구간 / 7주차 47일차 완주 \u2192 만렙 탐험 전용 전환');

// ───────────────────────────────────────────────
//  [C] 전략 비교
// ───────────────────────────────────────────────
hr('[C] 전략별 비교 (' + DAYS + '일 시뮬레이션)');
var keys = ['intended', 'safeOptimal', 'playFirst', 'lazy'];
var results = {};
console.log('  ' + pad('전략', 26) + pad('달성일', 8, true) + pad('완주일', 8, true) +
            pad('최종친밀도', 12, true) + pad('체력0', 7, true) + pad('포만0', 7, true) + pad('무행동', 8, true));
console.log('  ' + '─'.repeat(70));
keys.forEach(function (kk) {
  var rr = SIM.simulate({ strategy: kk, days: DAYS });
  results[kk] = rr;
  console.log('  ' + pad(SIM.STRATEGIES[kk].name.split(' (')[0], 26) +
    pad(rr.maxLevelDay || '미달', 8, true) +
    pad(rr.completeDay || '미달', 7, true) +
    pad(rr.finalAffection.toLocaleString(), 12, true) +
    pad(rr.stats.zeroHealthDays, 7, true) +
    pad(rr.stats.zeroHungerDays, 7, true) +
    pad(rr.stats.idleDays, 8, true));
});

hr('[C-2] 전략별 레벨 달성 일차');
keys.forEach(function (kk) {
  var ld = results[kk].levelDays;
  var line = [];
  for (var i = 1; i <= SPEC.MAX_STAGE; i++) line.push(i + ':' + (ld[i] || '-'));
  console.log('  ' + pad(SIM.STRATEGIES[kk].name.split(' (')[0], 26) + line.join(' '));
});

// ───────────────────────────────────────────────
//  [D] 불쾌감성 진단
// ───────────────────────────────────────────────
hr('[D] 불쾌감성 진단');
var base = results.intended, opt = results.playFirst;

function issue(level, title, body) {
  var tag = level === 'high' ? '🔴 위험' : (level === 'mid' ? '🟡 주의' : '🟢 양호');
  console.log('\n  ' + tag + '  ' + title);
  body.forEach(function (l) { console.log('        - ' + l); });
}

issue('high', '행동 효율 불균형 (놀아주기 ' + (eff.play / eff.feed).toFixed(1) + '배 우위)', [
  '"밥 주기"가 최악의 선택이 되는 육성 게임 = 감정적 역설',
  '먹이기 우선 ' + base.maxLevelDay + '일 vs 놀아주기 우선 ' + opt.maxLevelDay + '일 (' +
    (base.maxLevelDay - opt.maxLevelDay) + '일 격차)'
]);

issue('high', 'Cap 100 초과 회복량 버림', [
  '의도된 플레이에서 총 ' + (base.stats.wastedFeedHunger + base.stats.wastedFeedHealth) +
    'pt 회복량이 소멸 (포만감 ' + base.stats.wastedFeedHunger + ' / 체력 ' + base.stats.wastedFeedHealth + ')',
  '30P 지불했는데 게이지가 안 움직임 → "돈 버린 느낌"',
  '개선: 스탯 만렙 시 먹이기 비활성화 또는 초과분 친밀도 환산'
]);

issue('high', '최적 플레이가 곧 페널티 (놀아주기 우선 체력 0 ' + opt.stats.zeroHealthDays + '일)', [
  '효율을 따라간 유저가 최초 ' + opt.stats.firstZeroHealthDay + '일차에 체력 0 → 놀아주기·탐험 잠김',
  '주간 1회 탐험을 놓치면 그 주 보상이 영구 소실'
]);

issue(base.completeDay ? 'ok' : 'high',
  '10단계 진입(완주) ' + SPEC.STAGE_MAX.toLocaleString() + ' — ' +
  (base.completeDay ? base.completeDay + '일차' : '미달'), [
  '10단계 진입 친밀도 ' + SPEC.STAGE_THR[SPEC.MAX_STAGE].toLocaleString() +
    ' === 친밀도 상한 ' + SPEC.STAGE_MAX.toLocaleString() +
    ' → 10단계 진입 즉시 만렙 완주 (진입 = 완주)',
  '10단계는 구간 필요 친밀도·하트 1개당 수치가 없음 [-] → 마지막 육성 구간은 ' +
    '9단계(' + SPEC.STAGE_THR[SPEC.MAX_STAGE - 1].toLocaleString() + ', ' +
    SPEC.STAGE_ENTRY_DAY[SPEC.MAX_STAGE - 1] +
    '일차) → ' + SPEC.STAGE_MAX.toLocaleString() +
    ' (구간 ' + SPEC.STAGE_NEED[SPEC.MAX_STAGE - 1] + ' = 일일 +40 x ' +
    SPEC.STAGE_DWELL[SPEC.MAX_STAGE - 1] + '일)',
  '초반 빠른 성장: 2단계 진입 ' + SPEC.STAGE_ENTRY_DAY[2] + '일차 / 3단계 진입 ' +
    SPEC.STAGE_ENTRY_DAY[3] + '일차 / 4단계 진입 ' + SPEC.STAGE_ENTRY_DAY[4] +
    '일차 (1주차 단거리 탐험) / 5단계 진입 ' + SPEC.STAGE_ENTRY_DAY[5] +
    '일차 (2주차 중거리 탐험 해금)',
  '10단계 진입(1,880) 이후 규칙: SP 지급 유지 / 일일 패널티 미적용 / 먹이기·놀아주기 비활성 /' +
    ' 일일 보상 불가 / 탐험은 SP만 소모 (스탯 소모 없음)',
  base.completeDay
    ? '10단계 진입 = 완주 = ' + base.completeDay + '일차' +
      (base.completeDay === SPEC.STAGE_ENTRY_DAY[10] ? '  [기획 기대: 47일차 일치]' : '')
    : '기간 내 완주 미달'
]);

issue(base.stats.leftoverSP > 500 ? 'mid' : 'ok',
  '10단계 달성(완주) 이후 SP 사용처 부족 — 미사용 ' + base.stats.leftoverSP.toLocaleString() + 'P', [
  'SP는 계속 지급되지만 먹이기·놀아주기가 잠겨 주 1회 탐험(40P) 외에는 쓸 곳이 없음',
  '주당 280P 지급 대비 40P 소비 → 주당 240P 누적',
  '개선: 완주 후 SP 교환소 또는 반복 보상으로 포인트에 실제 가치 부여'
]);

issue('mid', '포만감이 아무것도 잠그지 않는 장식 스탯', [
  '행동 제한 조건은 체력 0 뿐 → 포만감 0 에 페널티 없음',
  '게이지 2개의 존재 이유가 유저에게 전달되지 않음'
]);

issue('mid', '완주 이후 무행동일 ' + base.stats.idleDays + '일', [
  'SP 지급은 유지되나 행동이 잠김 → 접속 동기 소멸',
  '개선: 완주 후 SP 교환소 / 반복 보상 콘텐츠 필요'
]);

issue('ok', '초반 성장 페이스 (5단계 ' + base.levelDays[5] + '일차)', [
  '1~5단계가 2주 내 완료 → 초반 이탈 방지에 유리',
  '6~9단계 주 1회 레벨업 페이스도 의도대로 성립 (' +
    [6, 7, 8, 9].map(function (i) { return i + '단계 ' + base.levelDays[i] + '일'; }).join(' / ') + ')'
]);

hr('분석 완료');
console.log('  브라우저 시뮬레이터: simulator.html');
console.log('  상세 리포트: BALANCE_ANALYSIS.md\n');
