// 扑克牌花色定义
export const SUITS = {
  HEARTS: 'hearts',     // ♥ 红桃
  DIAMONDS: 'diamonds', // ♦ 方块
  CLUBS: 'clubs',       // ♣ 梅花
  SPADES: 'spades',     // ♠ 黑桃
}

// 扑克牌点数定义（A到K）
export const RANKS = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'
]

// 大小王类型
export const JOKER_TYPES = {
  SMALL: 'joker_small',  // JOKER（小）
  BIG: 'joker_big',      // JOKER（大）
}

// 花色的显示信息（每个花色不同颜色）
export const SUIT_DISPLAY = {
  hearts: { 
    name: '红桃', 
    symbol: '♥', 
    color: '#ef4444'  // 红色
  },
  diamonds: { 
    name: '方块', 
    symbol: '♦', 
    color: '#f59e0b'  // 橙色
  },
  clubs: { 
    name: '梅花', 
    symbol: '♣', 
    color: '#10b981'  // 绿色
  },
  spades: { 
    name: '黑桃', 
    symbol: '♠', 
    color: '#002fa7'  // 克莱因蓝
  },
}

// 点数的权重（用于比较大小和排序）
export const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'small': 13.5, 'big': 13.8, 'A': 14,
}
