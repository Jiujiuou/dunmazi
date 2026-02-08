import { RANK_VALUES } from '../constants/cards'
import Logger from './logger'

/**
 * 比较两个手牌，确定胜负
 * 三级比牌规则：
 * 1. 第一级：比手牌总分（高者胜）
 * 2. 第二级：比花色等级（黑桃 > 红桃 > 梅花 > 方块）
 * 3. 第三级：比单张最大牌（逐张比较）
 * 4. 特殊：完全相同时扣牌者获胜
 * 
 * @param {Object} hand1 - 玩家1的评估结果 { playerId, evaluation, hand }
 * @param {Object} hand2 - 玩家2的评估结果
 * @param {string} knockerId - 扣牌者ID（平局判定用）
 * @returns {number} 1: hand1胜, -1: hand2胜, 0: 平局（但会根据扣牌者判定）
 */
export const compareHands = (hand1, hand2, knockerId) => {
  Logger.game('比牌开始')
  Logger.game('玩家1:', hand1.playerId, '分数:', hand1.evaluation.handScore)
  Logger.game('玩家2:', hand2.playerId, '分数:', hand2.evaluation.handScore)
  Logger.game('扣牌者:', knockerId)
  
  // 第一级：比分数
  if (hand1.evaluation.handScore !== hand2.evaluation.handScore) {
    const result = hand1.evaluation.handScore > hand2.evaluation.handScore ? 1 : -1
    Logger.game('第一级比分:', result === 1 ? '玩家1胜' : '玩家2胜')
    return result
  }
  
  Logger.game('分数相同 进入第二级比较')
  
  // 第二级：比花色等级
  const suitRank = { 
    spades: 4,    // 黑桃
    hearts: 3,    // 红桃
    clubs: 2,     // 梅花
    diamonds: 1   // 方块
  }
  
  const suit1 = hand1.evaluation.suit
  const suit2 = hand2.evaluation.suit
  
  if (suit1 !== suit2) {
    const rank1 = suitRank[suit1] || 0
    const rank2 = suitRank[suit2] || 0
    const result = rank1 > rank2 ? 1 : -1
    Logger.game('第二级比花色:', result === 1 ? '玩家1胜' : '玩家2胜', suit1, 'vs', suit2)
    return result
  }
  
  Logger.game('花色相同 进入第三级比较')
  
  // 第三级：比单张最大牌（逐张比较）
  const cards1 = sortCardsByValue(hand1.hand)
  const cards2 = sortCardsByValue(hand2.hand)
  
  for (let i = 0; i < Math.min(cards1.length, cards2.length); i++) {
    const value1 = getCardValue(cards1[i])
    const value2 = getCardValue(cards2[i])
    
    if (value1 !== value2) {
      const result = value1 > value2 ? 1 : -1
      Logger.game('第三级第', i+1, '张牌比较:', result === 1 ? '玩家1胜' : '玩家2胜')
      Logger.game('  牌1:', cards1[i].rank, cards1[i].suit, value1)
      Logger.game('  牌2:', cards2[i].rank, cards2[i].suit, value2)
      return result
    }
  }
  
  Logger.game('完全相同 扣牌者优先')
  
  // 完全相同：扣牌者获胜
  if (hand1.playerId === knockerId) {
    Logger.game('玩家1是扣牌者 玩家1胜')
    return 1
  }
  if (hand2.playerId === knockerId) {
    Logger.game('玩家2是扣牌者 玩家2胜')
    return -1
  }
  
  Logger.game('比牌结束 平局')
  return 0
}

/**
 * 获取牌的比较价值
 * 大王 > 小王 > A > K > Q > J > 10 > 9 > ... > 2
 */
const getCardValue = (card) => {
  if (card.suit === 'joker') {
    // 大王：15，小王：14
    return card.rank === 'big' ? 15 : 14
  }
  
  // A 最大
  if (card.rank === 'A') return 14
  
  // K, Q, J
  if (card.rank === 'K') return 13
  if (card.rank === 'Q') return 12
  if (card.rank === 'J') return 11
  
  // 数字牌按面值
  const numRank = parseInt(card.rank)
  if (!isNaN(numRank)) return numRank
  
  return 0
}

/**
 * 按价值从大到小排序牌
 */
const sortCardsByValue = (hand) => {
  return [...hand].sort((a, b) => getCardValue(b) - getCardValue(a))
}

/**
 * 确定多人比牌中的赢家
 * @param {Array} competitors - 参与比牌的玩家数组
 * @param {string} knockerId - 扣牌者ID
 * @returns {string} 赢家的 playerId
 */
export const determineWinner = (competitors, knockerId) => {
  Logger.game('========== 确定赢家 ==========')
  Logger.game('参赛者数量:', competitors.length, '扣牌者ID:', knockerId)
  
  if (competitors.length === 0) {
    // 所有人都随，扣牌者独赢
    Logger.game('所有人都随 扣牌者独赢')
    return knockerId
  }
  
  if (competitors.length === 1) {
    // 只有一个人参与比牌
    Logger.game('只有一人参赛:', competitors[0].playerId)
    return competitors[0].playerId
  }
  
  // 多人比牌：两两比较找出最大者
  let currentWinner = competitors[0]
  Logger.game('初始赢家:', currentWinner.playerId)
  
  for (let i = 1; i < competitors.length; i++) {
    Logger.game('比较:', currentWinner.playerId, 'vs', competitors[i].playerId)
    const result = compareHands(currentWinner, competitors[i], knockerId)
    
    if (result < 0) {
      currentWinner = competitors[i]
      Logger.game('新赢家:', currentWinner.playerId)
    } else {
      Logger.game('维持赢家:', currentWinner.playerId)
    }
  }
  
  Logger.game('========== 最终赢家:', currentWinner.playerId, '==========')
  return currentWinner.playerId
}

/**
 * 计算所有玩家的得分
 * @param {Array} players - 所有玩家
 * @param {Object} responses - 所有玩家的响应数据
 * @param {string} winnerId - 赢家ID
 * @param {number} targetScore - 目标分
 * @returns {Object} 玩家得分映射 { playerId: score }
 */
export const calculateScores = (players, responses, winnerId, targetScore) => {
  Logger.game('========== 计算得分 ==========')
  Logger.game('赢家ID:', winnerId, '目标分:', targetScore)
  
  const scores = {}
  const winnerResponse = responses[winnerId]
  
  if (!winnerResponse) {
    Logger.error('赢家响应数据不存在！')
    return scores
  }
  
  // 赢家的基础得分（手牌分 - 目标分）
  const winnerBaseScore = winnerResponse.evaluation.handScore - targetScore
  Logger.game('赢家基础得分:', winnerBaseScore)
  
  // 统计竞争池中输家的数量（砸了但输了的玩家）
  let losersInPool = []
  
  players.forEach(player => {
    const response = responses[player.id]
    
    if (!response) {
      scores[player.id] = 0
      Logger.game('玩家', player.nickname, ': 0分 (无响应数据)')
      return
    }
    
    Logger.game('计算玩家', player.nickname, player.id, '的得分:')
    Logger.game('  响应:', response.action, '是否麻子:', response.is_mazi)
    
    // 麻子扣分
    if (response.is_mazi) {
      scores[player.id] = 0
      Logger.game('  (麻子) 得分: 0')
    }
    // 随的玩家：获得自己的基础得分
    else if (response.action === 'fold') {
      const foldBaseScore = response.evaluation.handScore - targetScore
      scores[player.id] = foldBaseScore
      Logger.game('  (随) 得分:', foldBaseScore)
    }
    // 赢家：暂时设为基础分，稍后会加上竞争池总分
    else if (player.id === winnerId) {
      scores[player.id] = winnerBaseScore
      Logger.game('  (赢家) 基础得分:', winnerBaseScore)
    }
    // 砸了但输了（在竞争池内）
    else if (response.action === 'knock' || response.action === 'call') {
      const loserBaseScore = response.evaluation.handScore - targetScore
      losersInPool.push({ id: player.id, nickname: player.nickname, score: loserBaseScore })
      scores[player.id] = 0
      Logger.game('  (砸输了) 基础分:', loserBaseScore, '失分后: 0')
    }
    // 其他情况
    else {
      scores[player.id] = 0
      Logger.game('  (其他) 得分: 0')
    }
  })
  
  // 赢家最终得分 = 自己的基础分 + 所有竞争池输家的基础分总和
  let winnerFinalScore = winnerBaseScore
  losersInPool.forEach(loser => {
    winnerFinalScore += loser.score
    Logger.game('赢家吸收', loser.nickname, '的基础分:', loser.score)
  })
  
  scores[winnerId] = winnerFinalScore
  
  Logger.game('赢家最终得分:', winnerBaseScore, '+ 竞争池输家总分:', (winnerFinalScore - winnerBaseScore), '=', winnerFinalScore)
  Logger.game('========== 得分计算完成 ==========')
  
  return scores
}
