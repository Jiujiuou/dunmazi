import { SUITS, RANKS, JOKER_TYPES, RANK_VALUES } from '../constants/cards'
import { GAME_CONFIG } from '../constants/gameConfig'

/**
 * 创建标准扑克牌堆
 * @returns {Array} 牌堆数组，每张牌包含 suit, rank, id
 */
export const createDeck = () => {
  const deck = []
  
  // 生成 52 张标准牌（4个花色 × 13个点数）
  Object.values(SUITS).forEach(suit => {
    RANKS.forEach(rank => {
      deck.push({ 
        suit, 
        rank, 
        id: `${suit}_${rank}` 
      })
    })
  })
  
  // 根据配置决定是否添加大小王（2张）
  if (GAME_CONFIG.USE_JOKERS) {
    deck.push({ 
      suit: 'joker', 
      rank: 'small', 
      id: JOKER_TYPES.SMALL 
    })
    deck.push({ 
      suit: 'joker', 
      rank: 'big', 
      id: JOKER_TYPES.BIG 
    })
  }
  
  return deck
}

/**
 * 洗牌（Fisher-Yates 算法）
 * @param {Array} deck 牌堆
 * @returns {Array} 洗好的牌堆
 */
export const shuffleDeck = (deck) => {
  const shuffled = [...deck]
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  
  return shuffled
}

/**
 * 发牌
 * @param {Array} deck 牌堆
 * @param {number} count 发牌数量
 * @returns {Object} { dealt: 发出的牌, remaining: 剩余的牌堆 }
 */
export const dealCards = (deck, count) => {
  const dealt = deck.slice(0, count)
  const remaining = deck.slice(count)
  
  return { dealt, remaining }
}

/**
 * 比较两张牌的大小
 * @param {Object} card1 
 * @param {Object} card2 
 * @returns {number} 1表示card1大，-1表示card2大，0表示相等
 */
export const compareCards = (card1, card2) => {
  // 大王最大
  if (card1.id === JOKER_TYPES.BIG) return 1
  if (card2.id === JOKER_TYPES.BIG) return -1
  
  // 小王第二大
  if (card1.id === JOKER_TYPES.SMALL) return 1
  if (card2.id === JOKER_TYPES.SMALL) return -1
  
  // 比较普通牌的点数
  const value1 = RANK_VALUES[card1.rank]
  const value2 = RANK_VALUES[card2.rank]
  
  if (value1 > value2) return 1
  if (value1 < value2) return -1
  return 0
}

/**
 * 对手牌排序（从小到大）
 * @param {Array} hand 手牌
 * @returns {Array} 排序后的手牌
 */
export const sortHand = (hand) => {
  return [...hand].sort(compareCards)
}
