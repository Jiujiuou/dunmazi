export const GAME_CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,
  ROOM_CODE_LENGTH: 6,
  CARDS_PER_PLAYER: 5,
  USE_JOKERS: true,  // 使用大小王（54张牌）
  PUBLIC_ZONE_MAX: 5, // 公共区最大容量
  DEFAULT_TARGET_SCORE: 40, // 默认目标分
  TARGET_SCORE_OPTIONS: [35, 40, 45, 50], // 目标分选项
  DEFAULT_TOTAL_ROUNDS: 4, // 默认总局数
}

// 总局数选项
export const ROUND_OPTIONS = [
  { value: 1, label: '单局', duration: '约10分钟', description: '快速游戏' },
  { value: 4, label: '4局', duration: '约30分钟', description: '标准模式', recommended: true },
  { value: 8, label: '8局', duration: '约60分钟', description: '竞技模式' },
]

// 目标分选项
export const TARGET_SCORE_OPTIONS = [
  { value: 40, label: '40分', description: '标准难度', recommended: true },
  { value: 45, label: '45分', description: '高难度' },
]

export const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  SHOWDOWN: 'showdown',  // 结束响应阶段
  FINISHED: 'finished',
}

// 响应动作类型
export const SHOWDOWN_ACTIONS = {
  FOLD: 'fold',  // 随
  CALL: 'call',  // 砸
}

// 响应状态
export const RESPONSE_STATUS = {
  PENDING: 'pending',      // 等待响应
  RESPONDED: 'responded',  // 已响应
  NOT_YET: 'not_yet',      // 还未轮到
}
