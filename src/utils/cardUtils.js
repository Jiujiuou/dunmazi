import { SUITS, RANKS, JOKER_TYPES, RANK_VALUES, SUIT_DISPLAY } from '../constants/cards'
import { GAME_CONFIG } from '../constants/gameConfig'

/**
 * 创建单副标准扑克牌堆（用于兼容旧调用，id 无副数后缀）
 * @returns {Array} 牌堆数组，每张牌包含 suit, rank, id
 */
export const createDeck = () => {
  return createDecks(1)
}

/**
 * 创建多副扑克牌堆，每张牌 id 唯一（便于多副牌区分）
 * @param {number} count - 牌副数，1 或 2
 * @returns {Array} 牌堆数组，每张牌包含 suit, rank, id
 */
export const createDecks = (count = 1) => {
  const deck = []
  for (let deckIndex = 0; deckIndex < count; deckIndex++) {
    const idPrefix = count > 1 ? `d${deckIndex}_` : ''
    // 生成 52 张标准牌（4个花色 × 13个点数）
    Object.values(SUITS).forEach(suit => {
      RANKS.forEach(rank => {
        deck.push({
          suit,
          rank,
          id: `${idPrefix}${suit}_${rank}`,
        })
      })
    })
    if (GAME_CONFIG.USE_JOKERS) {
      deck.push({
        suit: 'joker',
        rank: 'small',
        id: count > 1 ? `${idPrefix}${JOKER_TYPES.SMALL}` : JOKER_TYPES.SMALL,
      })
      deck.push({
        suit: 'joker',
        rank: 'big',
        id: count > 1 ? `${idPrefix}${JOKER_TYPES.BIG}` : JOKER_TYPES.BIG,
      })
    }
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

/**
 * 手牌显示排序（按照游戏规则排列）
 * 规则：大王 → 小王 → 黑桃(A→2) → 红桃(A→2) → 梅花(A→2) → 方块(A→2)
 * @param {Array} hand 手牌
 * @returns {Array} 排序后的手牌
 */
export const sortHandForDisplay = (hand) => {
  const suitOrder = {
    'joker': 0,
    'spades': 1,
    'hearts': 2,
    'clubs': 3,
    'diamonds': 4
  }
  
  return [...hand].sort((a, b) => {
    // 1. 先按花色排序
    const suitDiff = suitOrder[a.suit] - suitOrder[b.suit]
    if (suitDiff !== 0) return suitDiff
    
    // 2. 同花色内部排序
    if (a.suit === 'joker') {
      // 大王在前，小王在后
      if (a.rank === 'big') return -1
      if (b.rank === 'big') return 1
      return 0
    }
    
    // 3. 普通牌按点数从大到小排列（A最大，2最小）
    const valueA = RANK_VALUES[a.rank]
    const valueB = RANK_VALUES[b.rank]
    return valueB - valueA // 降序
  })
}

/**
 * 将单张牌格式化为中文显示（如：红桃3、黑桃K、小王、大王）
 * @param {Object} card 牌对象 { suit, rank, id }
 * @returns {string}
 */
export const formatCardLabel = (card) => {
  if (!card) return ''
  if (card.suit === 'joker') {
    return card.rank === 'big' ? '大王' : '小王'
  }
  const suitName = SUIT_DISPLAY[card.suit]?.name || card.suit
  return `${suitName}${card.rank}`
}
