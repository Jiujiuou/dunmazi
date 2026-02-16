import { supabase } from '../../config/supabase'
import Logger from '../../utils/logger'

/** Realtime 订阅与状态刷新 */
export function subscribeSlice(set, get) {
  return {
    subscribeToGame: (gameId) => {
      Logger.realtime('开始订阅游戏 ID:', gameId)
      const channel = supabase
        .channel(`game:${gameId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
          async (payload) => {
            Logger.realtime('收到游戏状态更新 事件类型:', payload.eventType)
            const { game } = get()
            const oldVersion = game?.game_state?.version || 0
            const newVersion = payload.new?.game_state?.version || 0
            Logger.sync('版本检查 当前版本:', oldVersion, '新版本:', newVersion)
            if (oldVersion > 0 && newVersion > oldVersion + 1) {
              Logger.warn('检测到版本跳跃! 当前:', oldVersion, '接收:', newVersion)
              await get().refreshGameState()
              return
            }
            if (newVersion < oldVersion) {
              Logger.sync('忽略过期的游戏状态 本地版本:', oldVersion, '收到版本:', newVersion)
              return
            }
            Logger.realtime('游戏状态:', payload.new?.status, '阶段:', payload.new?.game_state?.phase)
            const { data: players, error: playersError } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId)
              .order('position')
            if (playersError) {
              Logger.error('查询玩家数据失败:', playersError.message)
              return
            }
            Logger.sync('同步查询到玩家数据 数量:', players?.length)
            const { currentPlayer } = get()
            let updatedCurrentPlayer = currentPlayer
            if (currentPlayer && players) {
              const found = players.find(p => p.id === currentPlayer.id)
              if (found) {
                updatedCurrentPlayer = found
                Logger.sync('更新当前玩家 手牌数:', found.hand?.length)
              }
            }
            set({ game: payload.new, players: players || [], currentPlayer: updatedCurrentPlayer })
            Logger.sync('状态同步完成 时间:', new Date().toLocaleTimeString(), '版本:', newVersion)
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
          async (payload) => {
            Logger.realtime('收到玩家数据更新 事件类型:', payload.eventType)
            const { data, error } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId)
              .order('position')
            if (error) {
              Logger.error('查询玩家数据失败:', error.message)
              return
            }
            if (data) {
              Logger.sync('玩家数据已更新 数量:', data.length)
              const { currentPlayer } = get()
              if (currentPlayer) {
                const updatedCurrentPlayer = data.find(p => p.id === currentPlayer.id)
                if (updatedCurrentPlayer) {
                  Logger.sync('当前玩家手牌数:', updatedCurrentPlayer.hand?.length)
                  set({ players: data, currentPlayer: updatedCurrentPlayer })
                  return
                }
              }
              set({ players: data })
            }
          }
        )
        .subscribe((status) => {
          Logger.realtime('订阅状态变更:', status)
          if (status === 'SUBSCRIBED') {
            Logger.sync('订阅成功 立即同步最新状态')
            get().refreshGameState()
            const syncInterval = setInterval(() => {
              Logger.sync('定期同步检查 频率: 5秒')
              get().refreshGameState()
            }, 5000)
            set({ syncInterval })
          } else if (status === 'CHANNEL_ERROR') {
            Logger.error('订阅出现错误 将在3秒后重新订阅')
            const { syncInterval } = get()
            if (syncInterval) clearInterval(syncInterval)
            get().refreshGameState()
            setTimeout(() => { Logger.sync('重新订阅游戏'); get().subscribeToGame(gameId) }, 3000)
          } else if (status === 'TIMED_OUT') {
            Logger.error('订阅超时 立即重新连接')
            const { syncInterval } = get()
            if (syncInterval) clearInterval(syncInterval)
            get().refreshGameState()
            setTimeout(() => get().subscribeToGame(gameId), 1000)
          }
        })
      set({ realtimeChannel: channel })
    },

    refreshGameState: async () => {
      const { game } = get()
      if (!game) {
        Logger.warn('无法刷新 没有游戏数据')
        return
      }
      Logger.sync('强制刷新游戏状态 游戏ID:', game.id)
      try {
        const [gameResult, playersResult] = await Promise.all([
          supabase.from('games').select('*').eq('id', game.id).single(),
          supabase.from('players').select('*').eq('game_id', game.id).order('position')
        ])
        if (gameResult.error) {
          Logger.error('刷新游戏数据失败:', gameResult.error.message)
          return
        }
        if (playersResult.error) {
          Logger.error('刷新玩家数据失败:', playersResult.error.message)
          return
        }
        const { currentPlayer } = get()
        let updatedCurrentPlayer = currentPlayer
        if (currentPlayer && playersResult.data) {
          const found = playersResult.data.find(p => p.id === currentPlayer.id)
          if (found) updatedCurrentPlayer = found
        }
        set({
          game: gameResult.data,
          players: playersResult.data || [],
          currentPlayer: updatedCurrentPlayer
        })
        Logger.sync('状态刷新完成 状态:', gameResult.data?.status, '玩家数:', playersResult.data?.length)
      } catch (error) {
        Logger.error('刷新状态出错:', error.message)
      }
    },
  }
}
