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

// 有效花色（非王），用于同花判定，避免缺失 suit 时误判为同花
const NORMAL_SUITS = ['hearts', 'spades', 'clubs', 'diamonds']

/**
 * 判断是否达成同花色
 * @param {Array} hand - 手牌数组
 * @param {number} handSize - 本局手牌张数（5 或 6），默认 5
 * @returns {Object} { isFlush: boolean, suit: string|null }
 */
export const checkFlush = (hand, handSize = 5) => {
  if (!hand || hand.length !== handSize) {
    return { isFlush: false, suit: null }
  }
  
  const jokers = hand.filter(card => card.suit === 'joker')
  // 只把带有效花色的牌当作普通牌，避免 suit 缺失/异常时 undefined === undefined 被误判为同花
  const normalCards = hand.filter(
    card => card.suit && card.suit !== 'joker' && NORMAL_SUITS.includes(card.suit)
  )
  // 若手牌里非王数量与「有效普通牌」数量不一致，说明有牌缺 suit 或无效，不做同花
  if (hand.length - jokers.length !== normalCards.length) {
    return { isFlush: false, suit: null }
  }
  
  // 情况1：全是王（2张王）
  if (jokers.length === 2) {
    return { isFlush: true, suit: 'spades' } // 默认视为黑桃
  }
  
  // 情况2：有王 + 有普通牌
  if (jokers.length > 0 && normalCards.length > 0) {
    const firstSuit = normalCards[0].suit
    const allSameSuit = normalCards.every(card => card.suit === firstSuit)
    if (allSameSuit) {
      return { isFlush: true, suit: firstSuit }
    }
    return { isFlush: false, suit: null }
  }
  
  // 情况3：没有王，全是普通牌
  if (normalCards.length === 0) {
    return { isFlush: false, suit: null }
  }
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
 * @param {number} handSize - 本局手牌张数，默认 5
 * @returns {string|null} 花色名称
 */
export const getHandSuit = (hand, handSize = 5) => {
  const { suit } = checkFlush(hand, handSize)
  return suit
}

/**
 * 判断是否可以扣牌
 * @param {Array} hand - 手牌数组
 * @param {number} targetScore - 目标分
 * @param {number} handSize - 本局手牌张数，默认 5
 * @returns {Object} { canKnock: boolean, reason: string, basicScore?: number }
 */
export const canKnock = (hand, targetScore, handSize = 5) => {
  const handScore = calculateHandScore(hand)
  const { isFlush } = checkFlush(hand, handSize)
  
  // 检查同花色
  if (!isFlush) {
    return { 
      canKnock: false, 
      reason: '未达成同花色' 
    }
  }
  
  // 检查分数：需超过最低分才能扣牌（例如最低 40 分则需至少 41 分）
  const minRequired = targetScore + 1
  if (handScore < minRequired) {
    const diff = minRequired - handScore
    return {
      canKnock: false,
      reason: `需超过 ${targetScore} 分才能扣牌，还差 ${diff} 分`,
    }
  }
  
  // 可以扣牌
  return {
    canKnock: true,
    reason: '可以扣牌！',
    basicScore: handScore - targetScore,
    handScore,
  }
}

/**
 * 获取手牌的完整评估信息
 * @param {Array} hand - 手牌数组
 * @param {number} targetScore - 目标分
 * @param {number} handSize - 本局手牌张数，默认 5
 * @returns {Object} 评估结果
 */
export const evaluateHand = (hand, targetScore = 40, handSize = 5) => {
  const handScore = calculateHandScore(hand)
  const { isFlush, suit } = checkFlush(hand, handSize)
  const knockInfo = canKnock(hand, targetScore, handSize)
  
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
 * @param {number} handSize - 本局手牌张数，默认 5
 * @returns {boolean}
 */
export const isMazi = (hand, targetScore, handSize = 5) => {
  const { isFlush } = checkFlush(hand, handSize)
  const handScore = calculateHandScore(hand)
  
  return !isFlush || handScore < targetScore
}

/**
 * 获取完整的玩家状态评估（用于响应阶段）
 * @param {Array} hand - 手牌数组
 * @param {number} targetScore - 目标分
 * @param {number} handSize - 本局手牌张数，默认 5
 * @returns {Object}
 */
export const getPlayerStatus = (hand, targetScore, handSize = 5) => {
  const evaluation = evaluateHand(hand, targetScore, handSize)
  const maziStatus = isMazi(hand, targetScore, handSize)
  
  return {
    ...evaluation,
    isMazi: maziStatus,
    canCall: !maziStatus,  // 只有非麻子才能砸
    canFold: true,          // 所有人都能随
  }
}
