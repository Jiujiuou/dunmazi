export const GAME_CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,
  ROOM_CODE_LENGTH: 6,
  CARDS_PER_PLAYER: 5,
  USE_JOKERS: true,  // 使用大小王（54张牌）
  PUBLIC_ZONE_MAX: 5, // 公共区最大容量
  DEFAULT_TARGET_SCORE: 40, // 默认目标分
  TARGET_SCORE_OPTIONS: [35, 40, 45, 50], // 目标分选项
}

export const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  SHOWDOWN: 'showdown',  // 结束响应阶段
  FINISHED: 'finished',
}
