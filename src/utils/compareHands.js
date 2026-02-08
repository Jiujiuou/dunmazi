import { RANK_VALUES } from '../constants/cards'

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
  console.log('========== 比牌开始 ==========')
  console.log('玩家1:', hand1.playerId, '分数:', hand1.evaluation.handScore)
  console.log('玩家2:', hand2.playerId, '分数:', hand2.evaluation.handScore)
  console.log('扣牌者:', knockerId)
  
  // 第一级：比分数
  if (hand1.evaluation.handScore !== hand2.evaluation.handScore) {
    const result = hand1.evaluation.handScore > hand2.evaluation.handScore ? 1 : -1
    console.log('第一级比分：', result === 1 ? '玩家1胜' : '玩家2胜')
    return result
  }
  
  console.log('分数相同，进入第二级比较')
  
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
    console.log('第二级比花色：', result === 1 ? '玩家1胜' : '玩家2胜', `(${suit1} vs ${suit2})`)
    return result
  }
  
  console.log('花色相同，进入第三级比较')
  
  // 第三级：比单张最大牌（逐张比较）
  const cards1 = sortCardsByValue(hand1.hand)
  const cards2 = sortCardsByValue(hand2.hand)
  
  console.log('排序后的牌1:', cards1.map(c => `${c.rank}${c.suit}`))
  console.log('排序后的牌2:', cards2.map(c => `${c.rank}${c.suit}`))
  
  for (let i = 0; i < Math.min(cards1.length, cards2.length); i++) {
    const value1 = getCardValue(cards1[i])
    const value2 = getCardValue(cards2[i])
    
    if (value1 !== value2) {
      const result = value1 > value2 ? 1 : -1
      console.log(`第三级第${i+1}张牌比较：`, result === 1 ? '玩家1胜' : '玩家2胜')
      console.log(`  牌1: ${cards1[i].rank}${cards1[i].suit} (${value1})`)
      console.log(`  牌2: ${cards2[i].rank}${cards2[i].suit} (${value2})`)
      return result
    }
  }
  
  console.log('完全相同，扣牌者优先')
  
  // 完全相同：扣牌者获胜
  if (hand1.playerId === knockerId) {
    console.log('玩家1是扣牌者，玩家1胜')
    return 1
  }
  if (hand2.playerId === knockerId) {
    console.log('玩家2是扣牌者，玩家2胜')
    return -1
  }
  
  console.log('========== 比牌结束（平局） ==========')
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
  console.log('========== 确定赢家 ==========')
  console.log('参赛者数量:', competitors.length)
  console.log('扣牌者ID:', knockerId)
  
  if (competitors.length === 0) {
    // 所有人都随，扣牌者独赢
    console.log('所有人都随，扣牌者独赢')
    return knockerId
  }
  
  if (competitors.length === 1) {
    // 只有一个人参与比牌
    console.log('只有一人参赛:', competitors[0].playerId)
    return competitors[0].playerId
  }
  
  // 多人比牌：两两比较找出最大者
  let currentWinner = competitors[0]
  console.log('初始赢家:', currentWinner.playerId)
  
  for (let i = 1; i < competitors.length; i++) {
    console.log(`\n比较: ${currentWinner.playerId} vs ${competitors[i].playerId}`)
    const result = compareHands(currentWinner, competitors[i], knockerId)
    
    if (result < 0) {
      currentWinner = competitors[i]
      console.log(`新赢家: ${currentWinner.playerId}`)
    } else {
      console.log(`维持赢家: ${currentWinner.playerId}`)
    }
  }
  
  console.log('========== 最终赢家:', currentWinner.playerId, '==========')
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
  console.log('========== 计算得分 ==========')
  console.log('赢家ID:', winnerId)
  console.log('目标分:', targetScore)
  
  const scores = {}
  const winnerResponse = responses[winnerId]
  
  if (!winnerResponse) {
    console.error('赢家响应数据不存在！')
    return scores
  }
  
  // 赢家的基础得分（手牌分 - 目标分）
  const winnerBaseScore = winnerResponse.evaluation.handScore - targetScore
  console.log('赢家基础得分:', winnerBaseScore)
  
  // 统计砸了但输了的玩家数量（这些人要给赢家额外分数）
  let losersCount = 0
  
  players.forEach(player => {
    const response = responses[player.id]
    
    if (!response) {
      scores[player.id] = 0
      console.log(`玩家 ${player.nickname}: 0分 (无响应数据)`)
      return
    }
    
    console.log(`\n计算玩家 ${player.nickname} (${player.id}) 的得分:`)
    console.log('  响应:', response.action)
    console.log('  是否麻子:', response.is_mazi)
    
    // 赢家得分
    if (player.id === winnerId) {
      // 暂时设为基础分，稍后会加上倍数
      scores[player.id] = winnerBaseScore
      console.log(`  (赢家) 基础得分: ${winnerBaseScore}`)
    }
    // 麻子扣分
    else if (response.is_mazi && response.action !== 'fold') {
      scores[player.id] = -targetScore
      console.log(`  (麻子) 扣分: -${targetScore}`)
    }
    // 随的玩家不得分
    else if (response.action === 'fold') {
      scores[player.id] = 0
      console.log('  (随) 得分: 0')
    }
    // 砸了但输了
    else if (response.action === 'call') {
      losersCount++
      scores[player.id] = -winnerBaseScore
      console.log(`  (砸输了) 失分: -${winnerBaseScore}`)
    }
    // 其他情况
    else {
      scores[player.id] = 0
      console.log('  (其他) 得分: 0')
    }
  })
  
  // 赢家最终得分 = 基础分 * (1 + 输家数量)
  const winnerFinalScore = winnerBaseScore * (1 + losersCount)
  scores[winnerId] = winnerFinalScore
  
  console.log(`\n赢家最终得分: ${winnerBaseScore} * (1 + ${losersCount}) = ${winnerFinalScore}`)
  console.log('========== 得分计算完成 ==========')
  
  return scores
}
