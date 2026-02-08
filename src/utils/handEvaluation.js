import { RANK_VALUES } from '../constants/cards'

/**
 * 计算手牌总分
 * @param {Array} hand - 手牌数组
 * @returns {number} 总分
 */
export const calculateHandScore = (hand) => {
  if (!hand || hand.length === 0) return 0
  
  return hand.reduce((total, card) => {
    // 大小王：10分
    if (card.suit === 'joker') {
      return total + 10
    }
    
    // A：11分
    if (card.rank === 'A') {
      return total + 11
    }
    
    // 2-9：按面值
    const numRank = parseInt(card.rank)
    if (!isNaN(numRank) && numRank >= 2 && numRank <= 9) {
      return total + numRank
    }
    
    // 10, J, Q, K：10分
    return total + 10
  }, 0)
}

/**
 * 判断是否达成同花色
 * @param {Array} hand - 手牌数组
 * @returns {Object} { isFlush: boolean, suit: string|null }
 */
export const checkFlush = (hand) => {
  if (!hand || hand.length !== 5) {
    return { isFlush: false, suit: null }
  }
  
  // 分离王和普通牌
  const jokers = hand.filter(card => card.suit === 'joker')
  const normalCards = hand.filter(card => card.suit !== 'joker')
  
  // 情况1：全是王（2张王）
  if (jokers.length === 2) {
    return { isFlush: true, suit: 'spades' } // 默认视为黑桃
  }
  
  // 情况2：有王 + 有普通牌
  if (jokers.length > 0 && normalCards.length > 0) {
    // 检查普通牌是否同花色
    const firstSuit = normalCards[0].suit
    const allSameSuit = normalCards.every(card => card.suit === firstSuit)
    
    if (allSameSuit) {
      return { isFlush: true, suit: firstSuit }
    }
    return { isFlush: false, suit: null }
  }
  
  // 情况3：没有王，全是普通牌
  const firstSuit = normalCards[0].suit
  const allSameSuit = normalCards.every(card => card.suit === firstSuit)
  
  return { 
    isFlush: allSameSuit, 
    suit: allSameSuit ? firstSuit : null 
  }
}

/**
 * 获取手牌的实际花色（考虑王）
 * @param {Array} hand - 手牌数组
 * @returns {string|null} 花色名称
 */
export const getHandSuit = (hand) => {
  const { suit } = checkFlush(hand)
  return suit
}

/**
 * 判断是否可以扣牌
 * @param {Array} hand - 手牌数组
 * @param {number} targetScore - 目标分
 * @returns {Object} { canKnock: boolean, reason: string, basicScore?: number }
 */
export const canKnock = (hand, targetScore) => {
  const handScore = calculateHandScore(hand)
  const { isFlush } = checkFlush(hand)
  
  // 检查同花色
  if (!isFlush) {
    return { 
      canKnock: false, 
      reason: '未达成同花色' 
    }
  }
  
  // 检查分数
  if (handScore < targetScore) {
    const diff = targetScore - handScore
    return { 
      canKnock: false, 
      reason: `还差 ${diff} 分` 
    }
  }
  
  // 可以扣牌
  return { 
    canKnock: true, 
    reason: '可以扣牌！',
    basicScore: handScore - targetScore
  }
}

/**
 * 获取手牌的完整评估信息
 * @param {Array} hand - 手牌数组
 * @param {number} targetScore - 目标分
 * @returns {Object} 评估结果
 */
export const evaluateHand = (hand, targetScore = 40) => {
  const handScore = calculateHandScore(hand)
  const { isFlush, suit } = checkFlush(hand)
  const knockInfo = canKnock(hand, targetScore)
  
  return {
    handScore,
    isFlush,
    suit,
    targetScore,
    basicScore: handScore - targetScore,
    canKnock: knockInfo.canKnock,
    knockReason: knockInfo.reason
  }
}

/**
 * 判断玩家是否为麻子
 * @param {Array} hand - 手牌数组
 * @param {number} targetScore - 目标分
 * @returns {boolean}
 */
export const isMazi = (hand, targetScore) => {
  const { isFlush } = checkFlush(hand)
  const handScore = calculateHandScore(hand)
  
  return !isFlush || handScore < targetScore
}

/**
 * 获取完整的玩家状态评估（用于响应阶段）
 * @param {Array} hand - 手牌数组
 * @param {number} targetScore - 目标分
 * @returns {Object}
 */
export const getPlayerStatus = (hand, targetScore) => {
  const evaluation = evaluateHand(hand, targetScore)
  const maziStatus = isMazi(hand, targetScore)
  
  return {
    ...evaluation,
    isMazi: maziStatus,
    canCall: !maziStatus,  // 只有非麻子才能砸
    canFold: true,          // 所有人都能随
  }
}
