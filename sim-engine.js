/* ═══════════════════════════════════════════════════════════════════
 *  아크바이스(모코콩) 이벤트 — 성장 시뮬레이션 엔진
 *  ------------------------------------------------------------------
 *  index.html 의 게임 로직(수정안 기준)과 완전히 동일한 규칙을 재현합니다.
 *  브라우저(simulator.html)와 Node(tools/analyze.js) 양쪽에서 공용 사용.
 *
 *  ⚠ 수치를 바꿀 때는 index.html 의 상수 블록과 함께 수정해야 합니다.
 * ═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArcViceSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────────────────────────────────────────────
  //  1. 스펙 상수 (index.html 과 1:1 동일)
  // ───────────────────────────────────────────────
  var SPEC = {
    DAILY_SP: 40,          // 일일 미션 획득 SP (미사용분 무제한 이월)
    STAGE_MAX: 1880,       // 친밀도 상한 = 10단계 달성 수치 (승급 = 완주, 47일차)
    HUNGER_INIT: 50,
    HEALTH_INIT: 50,
    STAT_MAX: 100,         // Cap — 초과 회복량은 버림
    DAILY_PEN_HUNGER: 10,  // 매일 06:00 갱신 차감
    DAILY_PEN_HEALTH: 5,
    MAX_STAGE: 10,

    ACTIONS: {
      feed: { sp: 30, hunger: +30, health: +35, affection: +20, dailyOnce: true,  label: '먹이기' },
      play: { sp: 10, hunger: -10, health: -15, affection: +20, dailyOnce: false, label: '놀아주기' }
    },
    EXPLORE: { sp: 40, hunger: -25, health: -30, affection: +40, label: '탐험' },

    // 누적 친밀도 승급 임계값 (밸런스 테이블 '누적 친밀도' 열)
    //  ※ STAGE_THR[s] = s단계를 "달성(= 완료)"하는 누적 친밀도 (기획서 표의 '누적 친밀도' 열 그대로)
    //  ※ STAGE_THR[1]=0 → 물주기 시 1일차 시작 즉시 1단계 달성 (체류 0일)
    //  ※ STAGE_THR[9] === STAGE_THR[10] === STAGE_MAX === 1,880
    //     → 9단계 완료(47일차) 즉시 10단계 도달 = 완주 (10단계 체류·요구치 없음 [-])
    STAGE_THR: { 1: 0, 2: 80, 3: 280, 4: 560, 5: 800, 6: 1040, 7: 1320, 8: 1600, 9: 1880, 10: 1880 },

    STAGE_NAMES: {
      0: '모코코 씨앗', 1: '모코콩 Lv.1', 2: '모코콩 Lv.2', 3: '모코콩 Lv.3',
      4: '모코코 Lv.4', 5: '모코코 Lv.5', 6: '모코코 Lv.6', 7: '모코코 Lv.7',
      8: '모코코 Lv.8', 9: '모코코 Lv.9', 10: '모코코 Lv.10 (만렙코코)'
    },

    // 단계별 구간 체류 기간 (일일 +40 기준) — 검증용 기대값
    //  · 1단계: 물주기로 당일 즉시 승급 (체류 0일)
    //  · 2~3단계: 초반 빠른 성장 (2일 / 5일)
    //  · 4~9단계: 점진적 성장, 단계별 최대 7일 이내 체류
    //  · 10단계: 체류 기간 없음 [-] (9단계 완료 즉시 도달)
    STAGE_DWELL: { 1: 0, 2: 2, 3: 5, 4: 7, 5: 6, 6: 6, 7: 7, 8: 7, 9: 7, 10: 0 },
    // 단계별 누적 완료 일차 (STAGE_THR[s] / 40) — 검증용 기대값
    //  · 3단계 = 7일차 완료  → 1주차 단거리 탐험 구간
    //  · 4단계 = 14일차 완료 → 2주차 중거리 탐험 해금 시점
    //  · 9단계 = 47일차 완료 → 즉시 10단계(만렙코코) 도달 = 47일차 최종 완성
    STAGE_DONE_DAY: { 1: 0, 2: 2, 3: 7, 4: 14, 5: 20, 6: 26, 7: 33, 8: 40, 9: 47, 10: 47 },

    // 주차별 탐험 보상 획득 시점 (일일 +40 정속 성장 기준)
    //  · 탐험은 주간 1회, 정기점검(수요일 = weekDay 1)에 초기화
    //  · tier: 1~3단계 단거리(A) / 4~7단계 중거리(B+D) / 8~10단계 장거리(C+D)
    EXPLORE_SCHEDULE: [
      { week: 1, dayFrom: 1,  dayTo: 7,  exploreDay: 7,  affection: 280,  stage: 3,  tier: 'short', tierName: '단거리', reward: 'A',     note: '1주차 단거리 탐험 (3단계 완료 시점)' },
      { week: 2, dayFrom: 8,  dayTo: 14, exploreDay: 14, affection: 560,  stage: 4,  tier: 'mid',   tierName: '중거리', reward: 'B + D', note: '2주차 중거리 탐험 해금 (4단계 진입)' },
      { week: 3, dayFrom: 15, dayTo: 21, exploreDay: 21, affection: 840,  stage: 5,  tier: 'mid',   tierName: '중거리', reward: 'B + D', note: '점진적 성장' },
      { week: 4, dayFrom: 22, dayTo: 28, exploreDay: 28, affection: 1120, stage: 6,  tier: 'mid',   tierName: '중거리', reward: 'B + D', note: '점진적 성장' },
      { week: 5, dayFrom: 29, dayTo: 35, exploreDay: 35, affection: 1400, stage: 7,  tier: 'mid',   tierName: '중거리', reward: 'B + D', note: '최대 체류 정속 성장' },
      { week: 6, dayFrom: 36, dayTo: 42, exploreDay: 42, affection: 1680, stage: 8,  tier: 'long',  tierName: '장거리', reward: 'C + D', note: '장거리 탐험 진입' },
      { week: 7, dayFrom: 43, dayTo: 49, exploreDay: 47, affection: 1880, stage: 10, tier: 'long',  tierName: '장거리', reward: 'C + D', note: '47일차 완주 → 만렙 탐험 전용 전환' }
    ],

    DAY_NAMES: ['수', '목', '금', '토', '일', '월', '화']  // weekDay 1 = 수(정기점검)
  };

  // 구간 폭(구간 필요 친밀도) — 누적 임계값에서 도출 → 두 표가 어긋날 수 없음
  // 도출 결과: 0/80/200/280/240/240/280/280/280/0 (총합 1,880)
  //  · need[1]  = 0 → 물주기로 1일차 시작 즉시 달성
  //  · need[10] = 0 → 9단계 완료(1,880) 즉시 만렙 도달 (요구치 없음 [-])
  SPEC.STAGE_NEED = (function () {
    var need = {};
    need[1] = 0;                                    // 1단계: 물주기로 즉시 달성 (누적 0)
    for (var s = 2; s <= SPEC.MAX_STAGE; s++) need[s] = SPEC.STAGE_THR[s] - SPEC.STAGE_THR[s - 1];
    return need;                                    // need[10] === 0 (만렙 요구치 없음)
  })();

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // 누적 친밀도 → 성장 단계 (역방향 스캔)
  //  · aff 0     → 1단계 (물주기 시 즉시 달성)
  //  · aff 1,880 → 10단계 (STAGE_THR[9]===STAGE_THR[10] 이므로 9단계를 통과해 만렙 반환)
  function stageOf(aff) {
    var cs = 1;
    for (var s = SPEC.MAX_STAGE; s >= 1; s--) { if (aff >= SPEC.STAGE_THR[s]) { cs = s; break; } }
    return cs;
  }

  // ───────────────────────────────────────────────
  //  2. 전략 (하루치 행동 순서 결정)
  //     ctx = { state, canFeed, canPlay, canExplore }
  //     반환: 'explore' | 'feed' | 'play' | null(하루 종료)
  // ───────────────────────────────────────────────
  var STRATEGIES = {
    intended: {
      key: 'intended',
      name: '의도된 플레이 (탐험 → 먹이기 → 놀아주기)',
      desc: '기획 의도대로 하루 40P를 먹이기 1회 + 놀아주기 1회로 소비합니다. 탐험 가능일에는 탐험에 40P를 전부 씁니다.',
      pick: function (c) {
        if (c.canExplore) return 'explore';
        if (c.canFeed) return 'feed';
        if (c.canPlay) return 'play';
        return null;
      }
    },
    playFirst: {
      key: 'playFirst',
      name: '효율 최적화 (놀아주기 우선)',
      desc: '친밀도/포인트 효율이 3배 높은 놀아주기에 SP를 최대한 투입합니다. 체력이 바닥나면 어쩔 수 없이 먹이기를 씁니다.',
      pick: function (c) {
        if (c.canExplore) return 'explore';
        if (c.canPlay) return 'play';
        if (c.canFeed) return 'feed';
        return null;
      }
    },
    safeOptimal: {
      key: 'safeOptimal',
      name: '안전 최적화 (체력 관리형)',
      desc: '체력이 놀아주기 1회분(15) 미만으로 떨어지기 전에 먹이기로 회복합니다. 스탯 0을 만들지 않으면서 최대 효율을 노립니다.',
      pick: function (c) {
        if (c.canExplore) return 'explore';
        if (c.canPlay && c.state.health > 15) return 'play';
        if (c.canFeed) return 'feed';
        if (c.canPlay) return 'play';
        return null;
      }
    },
    lazy: {
      key: 'lazy',
      name: '라이트 유저 (먹이기만 1회)',
      desc: '하루에 먹이기 1회(30P)만 하고 접속을 종료합니다. 남는 SP는 계속 이월됩니다. 탐험도 하지 않습니다.',
      noExplore: true,
      pick: function (c) {
        if (c.canFeed) return 'feed';
        return null;
      }
    }
  };

  /**
   * 커스텀 전략 생성 — 하루 행동 횟수를 직접 지정
   * @param {Object} p { feed:0|1, play:number, explore:boolean }
   */
  function customStrategy(p) {
    p = p || {};
    var wantFeed = p.feed ? 1 : 0;
    var wantPlay = (p.play === undefined || p.play === null) ? 99 : p.play;
    var useExplore = p.explore !== false;
    return {
      key: 'custom',
      name: '커스텀 (먹이기 ' + wantFeed + '회 / 놀아주기 ' + (wantPlay >= 99 ? 'SP 소진까지' : wantPlay + '회') +
            ' / 탐험 ' + (useExplore ? '사용' : '미사용') + ')',
      desc: '지정한 하루 행동 패턴을 그대로 반복합니다.',
      noExplore: !useExplore,
      reset: function (s) { s._f = 0; s._p = 0; },
      pick: function (c) {
        var s = c.state;
        if (c.canExplore) return 'explore';
        if (c.canFeed && s._f < wantFeed) return 'feed';
        if (c.canPlay && s._p < wantPlay) return 'play';
        return null;
      },
      after: function (s, act) {
        if (act === 'feed') s._f++;
        if (act === 'play') s._p++;
      }
    };
  }

  // ───────────────────────────────────────────────
  //  3. 시뮬레이션 본체
  // ───────────────────────────────────────────────
  /**
   * @param {Object} opt
   *   strategy   : STRATEGIES 키 (기본 'intended')
   *   days       : 시뮬레이션 일수 (기본 70)
   *   startWeekDay: 1~7 (기본 1 = 수요일/정기점검)
   *   bankSP     : true면 이월 SP까지 전부 소비 / false면 당일 획득분(40P)만 소비
   *   ※ 만렙 이후 규칙은 index.html 과 동일하게 항상 적용됩니다:
   *      일일 SP 지급 유지 / 일일 패널티 미적용 / 먹이기·놀아주기 비활성 /
   *      일일 보상 획득 불가 / 탐험은 활성 (SP만 소모, 스탯 소모 미적용)
   */
  function simulate(opt) {
    opt = opt || {};
    var strat = (typeof opt.strategy === 'object' && opt.strategy)
      ? opt.strategy
      : (STRATEGIES[opt.strategy || 'intended'] || STRATEGIES.intended);
    var totalDays = opt.days || 70;
    var bankSP = opt.bankSP !== false;

    var st = {
      sp: SPEC.DAILY_SP,        // DAY 1 진입 시 일일 미션분 확보
      hunger: SPEC.HUNGER_INIT,
      health: SPEC.HEALTH_INIT,
      affection: 0,
      weekDay: opt.startWeekDay || 1,
      weeklyExplore: 1,
      feedUsedToday: false
    };

    var stage = 1;                 // 0단계(씨앗)는 물주기 튜토리얼 → 즉시 1단계
    var rows = [];
    var levelDays = {};            // stage → 달성 일차
    levelDays[1] = 1;
    var maxLevelDay = null;
    var completeDay = null;        // 친밀도 1,880(만렙/완주) 도달 일차
    var zeroHealthDays = 0, zeroHungerDays = 0, firstZeroHealthDay = null, firstZeroHungerDay = null;
    var idleDays = 0;              // 할 수 있는 행동이 하나도 없던 날
    var wastedFeedHunger = 0, wastedFeedHealth = 0;  // Cap 으로 버려진 회복량
    var deadEndAt = null;          // 친밀도 상승 수단이 완전히 사라진 최초 일차

    for (var day = 1; day <= totalDays; day++) {
      // ── 주간 리셋 (수요일 = weekDay 1) ──
      if (day > 1 && st.weekDay === 1) { st.weeklyExplore = 1; }

      var budget = bankSP ? st.sp : Math.min(st.sp, SPEC.DAILY_SP);
      var spentToday = 0;
      var log = [];
      var stageAtDayStart = stage;
      if (strat.reset) strat.reset(st);

      // ── 하루 행동 루프 ──
      for (var guard = 0; guard < 200; guard++) {
        // 완주 기준 — 친밀도 상한(1,880) 도달 = 10단계 달성 시점 (승급 = 완주)
        var maxed = (st.affection >= SPEC.STAGE_MAX);
        var avail = budget - spentToday;

        // 완주 이후: 먹이기·놀아주기 비활성, 탐험만 유지
        var canFeed = !maxed && !st.feedUsedToday && avail >= SPEC.ACTIONS.feed.sp;
        var canPlay = !maxed && st.health > 0 && avail >= SPEC.ACTIONS.play.sp;
        // 완주 후 탐험은 스탯을 소모하지 않으므로 체력 조건에서 제외
        var canExplore = !strat.noExplore && st.weeklyExplore > 0 &&
                         (maxed || st.health > 0) && avail >= SPEC.EXPLORE.sp;

        var act = strat.pick({ state: st, stage: stage, canFeed: canFeed, canPlay: canPlay, canExplore: canExplore });
        if (!act) break;
        if (act === 'feed' && !canFeed) break;
        if (act === 'play' && !canPlay) break;
        if (act === 'explore' && !canExplore) break;

        if (act === 'explore') {
          spentToday += SPEC.EXPLORE.sp; st.sp -= SPEC.EXPLORE.sp;
          st.weeklyExplore--;
          // 완주(1,880) 이후 탐험은 SP만 소모 (포만감/체력 소모 미적용)
          if (!maxed) {
            st.hunger = clamp(st.hunger + SPEC.EXPLORE.hunger, 0, SPEC.STAT_MAX);
            st.health = clamp(st.health + SPEC.EXPLORE.health, 0, SPEC.STAT_MAX);
          }
          st.affection = clamp(st.affection + SPEC.EXPLORE.affection, 0, SPEC.STAGE_MAX);
          log.push(maxed ? '탐험(완주:SP만)' : '탐험');
        } else {
          var a = SPEC.ACTIONS[act];
          spentToday += a.sp; st.sp -= a.sp;
          if (act === 'feed') {
            st.feedUsedToday = true;
            wastedFeedHunger += Math.max(0, (st.hunger + a.hunger) - SPEC.STAT_MAX);
            wastedFeedHealth += Math.max(0, (st.health + a.health) - SPEC.STAT_MAX);
          }
          st.hunger = clamp(st.hunger + a.hunger, 0, SPEC.STAT_MAX);
          st.health = clamp(st.health + a.health, 0, SPEC.STAT_MAX);
          st.affection = clamp(st.affection + a.affection, 0, SPEC.STAGE_MAX);
          log.push(a.label);
        }
        if (strat.after) strat.after(st, act);

        // 승급 판정 (index.html render() 와 동일)
        var ns = stageOf(st.affection);
        if (ns > stage) {
          for (var s2 = stage + 1; s2 <= ns; s2++) { if (!levelDays[s2]) levelDays[s2] = day; }
          stage = ns;
          if (stage >= SPEC.MAX_STAGE && maxLevelDay === null) maxLevelDay = day;
        }
        if (st.affection >= SPEC.STAGE_MAX && completeDay === null) completeDay = day;
      }

      if (spentToday === 0) idleDays++;
      // 데드엔드 판정
      //  10단계 달성(1,880) = 완주 이므로 "만렙인데 상한 미달" 상태는 존재하지 않습니다.
      //  데드엔드는 완주 미달 상태에서 친밀도를 올릴 수단이 모두 막힌 경우만 해당합니다.
      if (deadEndAt === null && st.affection < SPEC.STAGE_MAX &&
          strat.noExplore && st.health <= 0) {
        deadEndAt = day;
      }
      if (st.health <= 0) { zeroHealthDays++; if (firstZeroHealthDay === null) firstZeroHealthDay = day; }
      if (st.hunger <= 0) { zeroHungerDays++; if (firstZeroHungerDay === null) firstZeroHungerDay = day; }

      rows.push({
        day: day,
        weekDay: st.weekDay,
        dayName: SPEC.DAY_NAMES[st.weekDay - 1],
        stage: stage,
        stageName: SPEC.STAGE_NAMES[stage],
        leveledUp: stage > stageAtDayStart,
        affection: st.affection,
        needNext: stage < SPEC.MAX_STAGE ? Math.max(0, SPEC.STAGE_THR[stage + 1] - st.affection) : 0,
        hunger: st.hunger,
        health: st.health,
        spSpent: spentToday,
        spLeft: st.sp,
        actions: log.slice(),
        idle: spentToday === 0,
        danger: st.health <= 0 || st.hunger <= 0
      });

      // ── 다음 날로 넘어가기 (index.html nextDay() 와 동일) ──
      st.weekDay = (st.weekDay % 7) + 1;
      // 일일 갱신 패널티 — 0단계 및 만렙(1,600) 이후에는 미적용
      if (stage >= 1 && st.affection < SPEC.STAGE_MAX) {
        st.hunger = clamp(st.hunger - SPEC.DAILY_PEN_HUNGER, 0, SPEC.STAT_MAX);
        st.health = clamp(st.health - SPEC.DAILY_PEN_HEALTH, 0, SPEC.STAT_MAX);
      }
      // 일일 SP 지급 — 완주 이후에도 계속 지급
      st.sp += SPEC.DAILY_SP;
      st.feedUsedToday = false;
    }

    return {
      strategy: strat.key,
      strategyName: strat.name,
      strategyDesc: strat.desc,
      days: totalDays,
      bankSP: bankSP,
      rows: rows,
      levelDays: levelDays,
      maxLevelDay: maxLevelDay,
      completeDay: completeDay,
      finalAffection: st.affection,
      finalStage: stage,
      stats: {
        zeroHealthDays: zeroHealthDays,
        zeroHungerDays: zeroHungerDays,
        firstZeroHealthDay: firstZeroHealthDay,
        firstZeroHungerDay: firstZeroHungerDay,
        idleDays: idleDays,
        wastedFeedHunger: wastedFeedHunger,
        wastedFeedHealth: wastedFeedHealth,
        leftoverSP: st.sp,                     // 끝까지 못 쓰고 남은(사장된) SP
        affectionGap: SPEC.STAGE_MAX - st.affection,   // 1,880 까지 남은 친밀도
        // 만렙 미달 구간에서는 먹이기/놀아주기가 살아있어 일일 +40 가능
        extraDaysNeeded: st.affection >= SPEC.STAGE_MAX ? 0
          : Math.ceil((SPEC.STAGE_MAX - st.affection) / 40),
        // ⚠ 데드엔드: 만렙(1,600) 미달 + 체력 0 + 탐험 미사용 전략에서만 발생.
        //   보유 SP가 탐험 비용(40P) 미만이면 친밀도를 올릴 수단이 전혀 없어
        //   친밀도가 영구히 고정됩니다 (기간을 늘려도 만렙 불가).
        deadEnd: (st.affection < SPEC.STAGE_MAX &&
                  !!strat.noExplore && st.health <= 0),
        deadEndAt: deadEndAt
      },
      exportedRowKeys: ['day', 'dayName', 'stage', 'affection', 'hunger', 'health', 'spSpent', 'spLeft']
    };
  }

  // 포인트당 친밀도 효율
  function efficiency() {
    return {
      feed: SPEC.ACTIONS.feed.affection / SPEC.ACTIONS.feed.sp,
      play: SPEC.ACTIONS.play.affection / SPEC.ACTIONS.play.sp,
      explore: SPEC.EXPLORE.affection / SPEC.EXPLORE.sp
    };
  }

  return {
    SPEC: SPEC,
    STRATEGIES: STRATEGIES,
    customStrategy: customStrategy,
    simulate: simulate,
    efficiency: efficiency,
    stageOf: stageOf,
    clamp: clamp
  };
});
