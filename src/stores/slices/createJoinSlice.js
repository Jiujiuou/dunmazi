import { supabase } from '../../config/supabase'
import { generateRoomCode } from '../../utils/roomCode'
import { GAME_CONFIG, GAME_STATUS } from '../../constants/gameConfig'
import Logger from '../../utils/logger'

const STORAGE_KEY_LAST_GAME = 'dunmazi_last_game'

function saveLastGame(gameId, playerId, roomCode, nickname) {
  try {
    localStorage.setItem(STORAGE_KEY_LAST_GAME, JSON.stringify({
      gameId,
      playerId,
      roomCode,
      nickname,
    }))
  } catch (e) {
    Logger.error('保存上次对局失败:', e?.message)
  }
}

function clearLastGame() {
  try {
    localStorage.removeItem(STORAGE_KEY_LAST_GAME)
  } catch (e) {}
}

/** 创建/加入/离开房间 */
export function createJoinSlice(set, get) {
  return {
    createGame: async (nickname, totalRounds = GAME_CONFIG.DEFAULT_TOTAL_ROUNDS, targetScore = GAME_CONFIG.DEFAULT_TARGET_SCORE, deckCount = 1, handSize = 5) => {
      set({ loading: true, error: null })
      try {
        const roomCode = generateRoomCode(GAME_CONFIG.ROOM_CODE_LENGTH)
        Logger.game('创建游戏 房间码:', roomCode, '总局数:', totalRounds, '目标分:', targetScore, '牌副数:', deckCount, '手牌数:', handSize)

        const { data: game, error: gameError } = await supabase
          .from('games')
          .insert({
            room_code: roomCode,
            status: GAME_STATUS.WAITING,
            total_rounds: totalRounds,
            current_round: 1,
            target_score: targetScore,
            deck_count: deckCount,
            hand_size: handSize,
            game_state: {},
            round_history: [],
          })
          .select()
          .single()

        if (gameError) throw gameError

        const { data: player, error: playerError } = await supabase
          .from('players')
          .insert({
            game_id: game.id,
            nickname,
            position: 0,
            hand: [],
            player_state: { isHost: true },
            total_score: 0,
            round_scores: [],
          })
          .select()
          .single()

        if (playerError) throw playerError

        set({ game, currentPlayer: player, players: [player], loading: false })
        get().subscribeToGame(game.id)
        saveLastGame(game.id, player.id, game.room_code, nickname)
        Logger.game('游戏创建成功 游戏ID:', game.id)
        return game
      } catch (error) {
        Logger.error('创建游戏失败:', error.message)
        set({ error: error.message, loading: false })
        throw error
      }
    },

    joinGame: async (roomCode, nickname) => {
      set({ loading: true, error: null })
      try {
        const code = roomCode.trim().toUpperCase()
        const { data: game, error: gameError } = await supabase
          .from('games')
          .select('*')
          .eq('room_code', code)
          .single()

        if (gameError) throw new Error('房间不存在')

        // 游戏已开始：尝试重新加入（用房间码 + 昵称找回已有玩家）
        if (game.status !== GAME_STATUS.WAITING) {
          const { data: existingPlayers } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', game.id)
            .order('position')

          const myNickname = nickname.trim()
          const player = existingPlayers?.find((p) => (p.nickname || '').trim() === myNickname)
          if (player) {
            Logger.game('重新加入对局 昵称:', myNickname)
            set({ game, currentPlayer: player, players: existingPlayers, loading: false })
            get().subscribeToGame(game.id)
            saveLastGame(game.id, player.id, game.room_code, myNickname)
            return game
          }
          throw new Error('游戏已开始，未找到你的记录，请确认房间码与昵称与当时一致')
        }

        const { data: existingPlayers } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', game.id)

        if (existingPlayers.length >= GAME_CONFIG.MAX_PLAYERS) {
          throw new Error('房间已满')
        }

        const { data: player, error: playerError } = await supabase
          .from('players')
          .insert({
            game_id: game.id,
            nickname: nickname.trim(),
            position: existingPlayers.length,
            hand: [],
            player_state: { isHost: false },
            total_score: 0,
            round_scores: [],
          })
          .select()
          .single()

        if (playerError) throw playerError

        Logger.game('玩家加入游戏 昵称:', nickname, '位置:', existingPlayers.length)
        set({ game, currentPlayer: player, players: [...existingPlayers, player], loading: false })
        get().subscribeToGame(game.id)
        saveLastGame(game.id, player.id, game.room_code, nickname.trim())
        return game
      } catch (error) {
        set({ error: error.message, loading: false })
        throw error
      }
    },

    /** 通过上次保存的 gameId + playerId 重新连接（用于刷新/关页后从 Lobby 一键回到对局） */
    reconnectGame: async (gameId, playerId) => {
      set({ loading: true, error: null })
      try {
        const { data: game, error: gameError } = await supabase
          .from('games')
          .select('*')
          .eq('id', gameId)
          .single()

        if (gameError || !game) throw new Error('对局不存在或已结束')

        const { data: player, error: playerError } = await supabase
          .from('players')
          .select('*')
          .eq('id', playerId)
          .eq('game_id', gameId)
          .single()

        if (playerError || !player) throw new Error('无法恢复你的座位，可能已被移除')

        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId)
          .order('position')

        set({ game, currentPlayer: player, players: players || [], loading: false })
        get().subscribeToGame(game.id)
        saveLastGame(game.id, player.id, game.room_code, player.nickname || '')
        Logger.game('重新连接对局 游戏ID:', game.id)
        return game
      } catch (error) {
        set({ error: error.message, loading: false })
        clearLastGame()
        throw error
      }
    },

    /** 读取并校验上次对局，用于 Lobby 显示「重新进入」；无效则返回 null */
    getLastGameOffer: () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_LAST_GAME)
        if (!raw) return null
        const data = JSON.parse(raw)
        if (data?.gameId && data?.playerId) return data
        return null
      } catch (e) {
        return null
      }
    },

    leaveGame: async () => {
      const { currentPlayer, realtimeChannel, syncInterval } = get()
      if (syncInterval) {
        Logger.sync('清除定期同步定时器')
        clearInterval(syncInterval)
      }
      if (realtimeChannel) {
        Logger.sync('取消 Realtime 订阅')
        await realtimeChannel.unsubscribe()
      }
      if (currentPlayer) {
        Logger.user('玩家离开房间:', currentPlayer.nickname)
        await supabase.from('players').delete().eq('id', currentPlayer.id)
      }
      clearLastGame()
      set({
        currentPlayer: null,
        game: null,
        players: [],
        error: null,
        realtimeChannel: null,
        syncInterval: null,
      })
    },
  }
}
