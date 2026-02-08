/**
 * 统一的日志工具
 * 用于分类和格式化控制台输出
 */

const LOG_CATEGORIES = {
  SYNC: '【状态同步】',
  USER: '【用户操作】',
  GAME: '【游戏逻辑】',
  ERROR: '【错误】',
  NETWORK: '【网络请求】',
  REALTIME: '【实时推送】',
}

class Logger {
  /**
   * 状态同步相关日志
   */
  static sync(message, ...args) {
    console.log(LOG_CATEGORIES.SYNC, message, ...args)
  }

  /**
   * 用户操作相关日志
   */
  static user(message, ...args) {
    console.log(LOG_CATEGORIES.USER, message, ...args)
  }

  /**
   * 游戏逻辑相关日志
   */
  static game(message, ...args) {
    console.log(LOG_CATEGORIES.GAME, message, ...args)
  }

  /**
   * 错误日志
   */
  static error(message, ...args) {
    console.error(LOG_CATEGORIES.ERROR, message, ...args)
  }

  /**
   * 网络请求相关日志
   */
  static network(message, ...args) {
    console.log(LOG_CATEGORIES.NETWORK, message, ...args)
  }

  /**
   * Realtime 推送相关日志
   */
  static realtime(message, ...args) {
    console.log(LOG_CATEGORIES.REALTIME, message, ...args)
  }

  /**
   * 警告日志
   */
  static warn(message, ...args) {
    console.warn(LOG_CATEGORIES.ERROR, message, ...args)
  }
}

export default Logger
