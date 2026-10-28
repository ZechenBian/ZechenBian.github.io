// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 对外接口 ===================== */
return {
  DEF, IDS, ACTIONS, ACT, STANCES, STANCE_KEY, LLM_TYPES, DEAL_TYPES, RL_TYPES, TREATY_TYPES, SB, MOB, MANP, CRISES, WORLD_EVENTS, LANDLOCKED, ISLAND,
  M, clamp, rk, dateOf,
  newGame, prepareTurn, finishTurn, reactionCandidates, ruleReactions, applyLLMReactions, applyWorldReactions, jointCandidates, crossEffects, planTargets, applyPlan,
  actionStatus, queueAction, unqueue, queueCustom, queueDeploy, deployStatus, queueDone, dynOptions, apLeft, apMax, moneyQueued, queuedOut,
  answerOffer, answerUltimatum, answerCrisis, cancelOp, haltFront, setFrontV, dealCheck, applyDeal, normalizeEffect, proposeH, applyHDeal, cleanHTerms, H_TERMS, HCONSENT,
  rel, infl, indep, boss, realm, controlled, atWar, enemies, hasTreaty, treatiesOf, isAlly, isPartner, sameBloc, econBlocs, isGreat,
  power, blocPower, landEff, navyEff, airEff, ground, homeGuard, reach, canStrike, strikePower, exposure, powerRatio, evalDeal, sanctionLevel, worldGDP,
  dist, landAdj, near, share, freeAt, committedAt, stations, inTransit, canStation, transitTurns, stagingOptions, estimateOp, estimateInvade, minTurns, defenseAt,
  shareV, freeV, committedV, inTransitV, dotw, groundV, seaV, vecOf, unitsOf, unitsV, V0, vadd, vmul, vmin, vsub0, vmax, vsum, isV, freeQV, queuedOutV, forcesNear,
  RULES2, fallen, FALLEN, dealAP, setMob, mobIdx, queuePackage, pkgRange, pkgItems, PKG_OK, consN, procAmt, invK, amtOf, AMT_MAX, progOf, coreAP2,
  RULES3, CAP3, AP3, apCost, apAI, apAIRange, mobAP, capEff, capLevel, moneyPct, actMoney, PKG_DISC3, CORE_OP_PCT3,
  queueDeal, resolveDeals, dealValue, dealSides, dealsClash, dealClash3, cleanDealTerms, dealMoney,
  unacceptOffer, alignBlock3, selfConflicts3, nobaseHost: NBH, noBase, nobaseize, setNobase, shielded: SHD, setShield, shieldIds: () => SHIELD.slice(), offerTerms3, askTerms3, ASK3, rivals3, aligned, rivalBloc3, coupUndo3,
  SCENARIOS, useScenario, sc, scenarioList, playable, migrate, setNeutral, isNeutral: NEU, neutralize, get NEUTRAL() { return NEUTRAL.slice(); }, setProv, provOf: PRV, provincialize, setGuard, isGuarded: GRD, GCAP, holdTerritory, ltxt, frontObjectives, cityName,
  SET_TYPES, settingPreview, previewSettings, checkSetting, ruleSettings, settingsBrief, cancelProgram, applyDefOv, playerMilMax, cityIdx,
  objThr, holdOf, airSupportOf, setFrontFocus, setOpFocus, setHold, frontTargets, isCapital, supRange,
  coreDue, coreView, coreOfActor, coreCalc, coreInterest, coreTheater, coreList, CORE_LV, CORE_OPS, corePlan, queueCore, coreBackDown, coreSide,
  conscriptN, persCap, persCapAt, manBase, industryView, prodUnits, warCapQ, mcapOf, mobMaxOf, MOBF, manning, soldierCost, trainTurns, inTraining, procCost, procLead, procPts, procUnits, PROC_TIER, TROOP_SIZE, reqDestOptions, reqDest, troopPreview, conscriptPubHit,
  blockadeStrength, blockadeDefense, seaDefenseAt, likelyHelp, nukeDeter,
  _candidates: candidates, _aiPlan: aiPlan, _conquer: conquer, _surrender: surrender, // 测试用
  GOALS, goalsOf, goalsInit, goalsTurn, goalsView, scoreOf, standings,
  SEAT_KEYS, seatDefaults, humansOf, isHuman, seatOf, withSeat, forHumans, forSeats, adoptSeat, swapSeat, addHuman, dropHuman, setupHumans, seatPending, seatCB, execCmd, CMD, setMil, setMix,
  WE_KEYS, WE_ACTS, WE_DEF, weView, weEstimate, setWe, weAction, weActCheck, weCredit, weMilCap, occOf,
  PATCH_FIELDS, PF, normalizePatch, applyPatch, patchBrief, pfGet,
  TH_ON, TT, DOC, TER, TH_DAYS, TH_PHASES, thStatic, thInit, thBegin, thPhase, thEnd, thRunQuarter, thSync, thPath, thEdge, thFr, thHostile, thSeaLink, thSupply, thOrderUnits, thSetAir, thSetStaff, thSetHold, thDemolish, thUnitsOf, thDate, thWx, thEst, thHash, thActive, thActiveFor, thPoolV, thAirCtl, thOfRegion, thFrontZones, thPlanOf, thResetCache, uw, ustr, thUfAct, thCnPolicy, thEnemyIn, thAux, thGueSup, thView, thTheatersOf, thOrderKinds, thPreview, thSources, thSideOf, thSetSkip, thTheaters, thZoneName, thDateMsg, thOccInfo, thOccK, thOccGain, thWorldBrief, thFocusZ, thHoldZ, thBombK, thAirBoost, thPlanOps, thOpsView, thOpStart, thOpAttackEst, thSecs, _thNewUnit: thNewUnit, _thAutoFront: thAutoFront, _declareWar: declareWar, _newReport: newReport, _thData: T => TH_DATA[T], _thAIdebug: thAIdebug, _thHook: f => { TH_HOOK = f; }, _thOpx: TH_OPX,
  threatTo, hegemony, stats, rankings, politicsView, dossier, redLinesOf, legitCB, warAuth, electionOdds, coupRisk, intelOf, stanceOf, relevance, activeCommit,
  growthBreak, stabBreak, fiscalBreak, milBreak, // 局势说明用的分解（网页版 v4；只读）
};
})();
if (typeof module !== 'undefined') module.exports = WG;
