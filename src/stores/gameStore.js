import { create } from 'zustand'
import { supabase } from '../config/supabase'
import { generateRoomCode } from '../utils/roomCode'
import { GAME_CONFIG, GAME_STATUS, SHOWDOWN_ACTIONS, RESPONSE_STATUS } from '../constants/gameConfig'
import { createDecks, shuffleDeck, dealCards, sortHandForDisplay } from '../utils/cardUtils'
import { canKnock as checkCanKnock, evaluateHand, getPlayerStatus } from '../utils/handEvaluation'
import { determineWinner, calculateScores } from '../utils/compareHands'
import Logger from '../utils/logger'

export const useGameStore = create((set, get) => ({
  currentPlayer: null,
  game: null,
  players: [],
  loading: false,
  error: null,
  realtimeChannel: null, // 保存 Realtime 频道引用
  syncInterval: null, // 定期同步定时器

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

      set({ 
        game, 
        currentPlayer: player,
        players: [player],
        loading: false 
      })

      get().subscribeToGame(game.id)
      
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
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .single()

      if (gameError) throw new Error('房间不存在')
      if (game.status !== GAME_STATUS.WAITING) throw new Error('游戏已开始')

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
          nickname,
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

      set({ 
        game, 
        currentPlayer: player,
        players: [...existingPlayers, player],
        loading: false 
      })

      get().subscribeToGame(game.id)
      
      return game
    } catch (error) {
      set({ error: error.message, loading: false })
      throw error
    }
  },

  subscribeToGame: (gameId) => {
    Logger.realtime('开始订阅游戏 ID:', gameId)
    
    // 创建频道并保存引用，以便后续可以检查连接状态
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        async (payload) => {
          Logger.realtime('收到游戏状态更新 事件类型:', payload.eventType)
          
          const { game } = get()
          const oldVersion = game?.game_state?.version || 0
          const newVersion = payload.new?.game_state?.version || 0
          
          Logger.sync('版本检查 当前版本:', oldVersion, '新版本:', newVersion)
          
          // ✅ 版本号检测：检查是否跳跃
          if (oldVersion > 0 && newVersion > oldVersion + 1) {
            const missedUpdates = newVersion - oldVersion - 1
            Logger.warn('检测到版本跳跃! 当前:', oldVersion, '接收:', newVersion, '错过:', missedUpdates, '次更新')
            Logger.sync('立即同步数据库以获取最新状态')
            
            // 立即同步最新状态
            await get().refreshGameState()
            return
          }
          
          // ✅ 忽略过期推送：避免 Realtime 乱序/旧事件覆盖刚写入的下一局状态（导致起始玩家无「出1张牌」按钮）
          if (newVersion < oldVersion) {
            Logger.sync('忽略过期的游戏状态 本地版本:', oldVersion, '收到版本:', newVersion)
            return
          }
          
          Logger.realtime('游戏状态:', payload.new?.status, '阶段:', payload.new?.game_state?.phase, '公共区牌数:', payload.new?.game_state?.public_zone?.length)
          
          // ✅ 立即查询最新的 players 数据，确保状态一致
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
          
          // 同步更新 currentPlayer
          const { currentPlayer } = get()
          let updatedCurrentPlayer = currentPlayer
          
          if (currentPlayer && players) {
            const found = players.find(p => p.id === currentPlayer.id)
            if (found) {
              updatedCurrentPlayer = found
              Logger.sync('更新当前玩家 手牌数:', found.hand?.length)
            }
          }
          
          // ✅ 原子性更新：同时更新 game 和 players，避免状态不一致
          set({ 
            game: payload.new,
            players: players || [],
            currentPlayer: updatedCurrentPlayer
          })
          
          const now = new Date().toLocaleTimeString()
          Logger.sync('状态同步完成 时间:', now, '版本:', newVersion)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`,
        },
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
            
            // 同步更新 currentPlayer
            if (currentPlayer) {
              const updatedCurrentPlayer = data.find(p => p.id === currentPlayer.id)
              if (updatedCurrentPlayer) {
                Logger.sync('当前玩家手牌数:', updatedCurrentPlayer.hand?.length)
                set({ 
                  players: data,
                  currentPlayer: updatedCurrentPlayer
                })
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
          
          // ✅ 订阅成功后立即同步最新状态
          get().refreshGameState()
          
          // ✅ 启动定期同步（5秒），与 Realtime 互补，减少对手动刷新的依赖
          const syncInterval = setInterval(() => {
            Logger.sync('定期同步检查 频率: 5秒')
            get().refreshGameState()
          }, 5000) // 5秒
          
          set({ syncInterval })
          
        } else if (status === 'CHANNEL_ERROR') {
          Logger.error('订阅出现错误 将在3秒后重新订阅')
          
          // 清除定时器
          const { syncInterval } = get()
          if (syncInterval) clearInterval(syncInterval)
          
          // ✅ 错误时也同步状态，防止错过更新
          get().refreshGameState()
          
          // 3秒后尝试重新订阅
          setTimeout(() => {
            Logger.sync('重新订阅游戏')
            get().subscribeToGame(gameId)
          }, 3000)
          
        } else if (status === 'TIMED_OUT') {
          Logger.error('订阅超时 立即重新连接')
          
          // 清除定时器
          const { syncInterval } = get()
          if (syncInterval) clearInterval(syncInterval)
          
          // ✅ 超时时同步状态
          get().refreshGameState()
          
          // 立即重试
          setTimeout(() => {
            get().subscribeToGame(gameId)
          }, 1000)
        }
      })
    
    // 保存频道引用，方便后续检查或清理
    set({ realtimeChannel: channel })
  },

  toggleReady: async () => {
    const { currentPlayer, game } = get()
    
    if (!currentPlayer || !game) return
    
    try {
      const currentReady = currentPlayer.player_state?.isReady || false
      
      const { error } = await supabase
        .from('players')
        .update({
          player_state: {
            ...currentPlayer.player_state,
            isReady: !currentReady
          }
        })
        .eq('id', currentPlayer.id)
      
      if (error) throw error
      
      // 更新本地状态
      set({
        currentPlayer: {
          ...currentPlayer,
          player_state: {
            ...currentPlayer.player_state,
            isReady: !currentReady
          }
        }
      })
    } catch (error) {
      set({ error: error.message })
      throw error
    }
  },

  startGame: async () => {
    const { game, players, currentPlayer } = get()
    
    if (!game || !currentPlayer) return
    
    // 验证是否为房主
    if (!currentPlayer.player_state?.isHost) {
      throw new Error('只有房主可以开始游戏')
    }
    
    // 验证玩家数量
    if (players.length < GAME_CONFIG.MIN_PLAYERS) {
      throw new Error(`至少需要 ${GAME_CONFIG.MIN_PLAYERS} 名玩家`)
    }
    
    // 验证所有玩家都已准备（房主除外）
    const nonHostPlayers = players.filter(p => !p.player_state?.isHost)
    const allReady = nonHostPlayers.every(p => p.player_state?.isReady)
    
    if (!allReady) {
      throw new Error('所有玩家都需要准备')
    }
    
    try {
      set({ loading: true, error: null })
      
      const deckCount = game.deck_count ?? 1
      const handSize = game.hand_size ?? GAME_CONFIG.CARDS_PER_PLAYER
      
      // 1. 创建并洗牌（支持多副牌）
      const deck = createDecks(deckCount)
      let shuffledDeck = shuffleDeck(deck)
      
      // 2. 给每个玩家发牌（起始玩家 handSize+1 张，其他人 handSize 张）
      const dealPromises = players.map(async (player) => {
        const isStartingPlayer = player.position === 0
        const cardsCount = isStartingPlayer ? handSize + 1 : handSize
        
        const { dealt, remaining } = dealCards(shuffledDeck, cardsCount)
        shuffledDeck = remaining // 更新剩余牌堆
        
        // 手牌按游戏规则排序（大王→小王→黑桃→红桃→梅花→方块，同花色A→2）
        const sortedHand = sortHandForDisplay(dealt)
        
        // 更新玩家手牌
        await supabase
          .from('players')
          .update({ hand: sortedHand })
          .eq('id', player.id)
        
        return sortedHand
      })
      
      await Promise.all(dealPromises)
      
      // 3. 更新游戏状态为 playing，并保存剩余牌堆
      const targetScore = game.target_score || GAME_CONFIG.DEFAULT_TARGET_SCORE
      
      const { error } = await supabase
        .from('games')
        .update({
          status: GAME_STATUS.PLAYING,
          game_state: {
            version: 1, // ✅ 初始化版本号
            started_at: new Date().toISOString(),
            current_turn: 0,
            round_number: 0, // 回合计数，从0开始
            deck: shuffledDeck, // 摸牌堆
            public_zone: [], // 公共区（0-5张）
            discard_pile: [], // 弃牌堆
            phase: 'first_play', // 首回合特殊阶段：直接出牌
            target_score: targetScore, // 使用数据库中的目标分
          }
        })
        .eq('id', game.id)
      
      if (error) throw error
      
      Logger.game('游戏开始 版本: 1 玩家数:', players.length, '目标分:', targetScore, '第', game.current_round, '/', game.total_rounds, '局')
      set({ loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
      throw error
    }
  },

  leaveGame: async () => {
    const { currentPlayer, realtimeChannel, syncInterval } = get()
    
    // 清理定时器
    if (syncInterval) {
      Logger.sync('清除定期同步定时器')
      clearInterval(syncInterval)
    }
    
    // 取消订阅
    if (realtimeChannel) {
      Logger.sync('取消 Realtime 订阅')
      await realtimeChannel.unsubscribe()
    }
    
    if (currentPlayer) {
      Logger.user('玩家离开房间:', currentPlayer.nickname)
      await supabase
        .from('players')
        .delete()
        .eq('id', currentPlayer.id)
    }

    set({ 
      currentPlayer: null, 
      game: null, 
      players: [],
      error: null,
      realtimeChannel: null,
      syncInterval: null
    })
  },

  clearError: () => set({ error: null }),

  // 🔧 辅助函数：更新游戏状态并递增版本号
  updateGameStateWithVersion: async (updates) => {
    const { game } = get()
    if (!game) throw new Error('游戏状态异常')
    
    const currentVersion = game.game_state.version || 0
    const newVersion = currentVersion + 1
    
    const newGameState = {
      ...game.game_state,
      ...updates,
      version: newVersion
    }
    
    Logger.network('更新游戏状态 当前版本:', currentVersion, '新版本:', newVersion)
    
    const { data, error } = await supabase
      .from('games')
      .update({ game_state: newGameState })
      .eq('id', game.id)
      .select()
      .single()
    
    if (error) throw error
    
    Logger.sync('游戏状态已更新 版本:', newVersion)
    
    return data
  },

  // 获取当前回合的玩家
  getCurrentTurnPlayer: () => {
    const { game, players } = get()
    if (!game || !players.length) return null
    
    const currentTurn = game.game_state?.current_turn || 0
    return players.find(p => p.position === currentTurn)
  },

  // 检查是否轮到当前玩家
  isMyTurn: () => {
    const { currentPlayer } = get()
    const currentTurnPlayer = get().getCurrentTurnPlayer()
    return currentPlayer?.id === currentTurnPlayer?.id
  },

  // 切换到下一个玩家的回合
  nextTurn: async () => {
    const { game, players } = get()
    if (!game) return
    
    const currentTurn = game.game_state?.current_turn || 0
    const roundNumber = game.game_state?.round_number || 0
    const nextTurn = (currentTurn + 1) % players.length
    
    // 如果回到起始玩家，回合数+1
    const newRoundNumber = nextTurn === 0 ? roundNumber + 1 : roundNumber
    
    const { error } = await supabase
      .from('games')
      .update({
        game_state: {
          ...game.game_state,
          current_turn: nextTurn,
          round_number: newRoundNumber,
          phase: 'action_select', // 重置为行动选择阶段
        }
      })
      .eq('id', game.id)
    
    if (error) throw error
  },

  // 辅助函数：切换回合并更新游戏状态
  nextTurnWithState: async (stateUpdates) => {
    const { game, players } = get()
    if (!game) return
    
    const currentTurn = game.game_state?.current_turn || 0
    const roundNumber = game.game_state?.round_number || 0
    const nextTurn = (currentTurn + 1) % players.length
    const newRoundNumber = nextTurn === 0 ? roundNumber + 1 : roundNumber
    
    const { error } = await supabase
      .from('games')
      .update({
        game_state: {
          ...game.game_state,
          ...stateUpdates,
          current_turn: nextTurn,
          round_number: newRoundNumber,
          phase: 'action_select',
        }
      })
      .eq('id', game.id)
    
    if (error) throw error
  },

  // 摸牌功能（摸1打1的摸牌阶段）
  drawCard: async () => {
    // 防止连续点击导致重复摸牌：先占位 loading，再校验
    if (get().loading) {
      return
    }
    set({ loading: true, error: null })

    const { game, currentPlayer } = get()
    
    if (!game || !currentPlayer) {
      set({ loading: false })
      throw new Error('游戏状态异常')
    }
    
    // 验证：是否轮到自己
    if (!get().isMyTurn()) {
      set({ loading: false })
      throw new Error('还没轮到你')
    }

    // 验证：是否在正确的阶段（action_select 或 draw_and_play 都可以）
    const currentPhase = game.game_state?.phase || 'action_select'
    if (currentPhase !== 'action_select' && currentPhase !== 'draw_and_play') {
      set({ loading: false })
      throw new Error('当前不能摸牌')
    }
    
    // 验证：牌堆是否还有牌
    const deck = game.game_state?.deck || []
    if (deck.length === 0) {
      set({ loading: false })
      throw new Error('牌堆已空')
    }
    
    const publicZoneMax = game.hand_size ?? GAME_CONFIG.PUBLIC_ZONE_MAX
    const publicZone = game.game_state?.public_zone || []
    if (publicZone.length >= publicZoneMax) {
      set({ loading: false })
      throw new Error('公共区已满，不能摸牌出牌')
    }
    
    try {
      
      Logger.user('摸牌操作 剩余牌堆:', deck.length)
      
      // 1. 从牌堆顶部抽一张牌
      const drawnCard = deck[0]
      const remainingDeck = deck.slice(1)
      
      // 2. 将牌加入玩家手牌并按规则排序
      const newHand = sortHandForDisplay([...currentPlayer.hand, drawnCard])
      
      // 3. 更新玩家手牌
      const playerUpdateResult = await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
        .select()
        .single()
      
      if (playerUpdateResult.error) throw playerUpdateResult.error
      
      // 4. 更新游戏状态（更新牌堆，切换到出牌阶段）
      const currentVersion = game.game_state.version || 0
      const newGameState = {
        ...game.game_state,
        version: currentVersion + 1, // ✅ 递增版本号
        deck: remainingDeck,
        phase: 'play_after_draw',
      }
      
      const gameUpdateResult = await supabase
        .from('games')
        .update({
          game_state: newGameState
        })
        .eq('id', game.id)
        .select()
        .single()
      
      if (gameUpdateResult.error) throw gameUpdateResult.error
      
      // 5. 记录游戏动作
      await supabase
        .from('game_actions')
        .insert({
          game_id: game.id,
          player_id: currentPlayer.id,
          action_type: 'draw_card',
          action_data: {
            card: drawnCard,
            hand_count: newHand.length
          }
        })
      
      // ✅ 立即更新本地状态（乐观更新）
      set({ 
        currentPlayer: playerUpdateResult.data,
        game: gameUpdateResult.data,
        loading: false 
      })
      
      Logger.game('摸牌完成 版本:', currentVersion + 1, '手牌数:', newHand.length)
      Logger.sync('本地状态已更新')
      
      return drawnCard
    } catch (error) {
      Logger.error('摸牌失败:', error.message)
      set({ error: error.message, loading: false })
      // 刷新状态以同步数据库
      await get().refreshGameState()
      throw error
    }
  },

  // 出牌到公共区
  playToPublicZone: async (selectedCards) => {
    const { game, currentPlayer } = get()
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    // 验证：是否轮到自己
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你')
    }
    
    // 验证：是否选择了牌
    if (!selectedCards || selectedCards.length === 0) {
      throw new Error('请选择要出的牌')
    }

    // 验证：只能出一张牌
    if (selectedCards.length > 1) {
      throw new Error('一次只能出一张牌')
    }
    
    const currentPhase = game.game_state?.phase
    const publicZone = game.game_state?.public_zone || []
    const publicZoneMax = game.hand_size ?? GAME_CONFIG.PUBLIC_ZONE_MAX
    
    // 验证：公共区容量
    if (publicZone.length >= publicZoneMax) {
      throw new Error('公共区已满')
    }
    
    // 验证阶段
    if (currentPhase !== 'first_play' && currentPhase !== 'play_after_draw') {
      Logger.error('阶段不匹配 当前阶段:', currentPhase)
      throw new Error('当前不能出牌')
    }
    
    try {
      set({ loading: true, error: null })
      
      Logger.user('出牌操作 手牌数:', currentPlayer.hand.length, '公共区:', publicZone.length)
      
      // 1. 从手牌中移除已出的牌
      const newHand = currentPlayer.hand.filter(
        card => !selectedCards.some(sc => sc.id === card.id)
      )
      
      // 2. 将牌加入公共区
      const newPublicZone = [...publicZone, ...selectedCards]
      
      // 3. 更新玩家手牌
      const playerUpdateResult = await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
        .select()
        .single()
      
      if (playerUpdateResult.error) {
        throw playerUpdateResult.error
      }
      
      // 4. 记录游戏动作
      await supabase
        .from('game_actions')
        .insert({
          game_id: game.id,
          player_id: currentPlayer.id,
          action_type: 'play_to_public',
          action_data: {
            cards: selectedCards,
            hand_count: newHand.length,
            public_zone_count: newPublicZone.length
          }
        })
      
      // 5. 切换到下一个玩家，同时更新公共区
      const currentTurn = game.game_state?.current_turn || 0
      const roundNumber = game.game_state?.round_number || 0
      const players = get().players
      const nextTurn = (currentTurn + 1) % players.length
      const newRoundNumber = nextTurn === 0 ? roundNumber + 1 : roundNumber
      
      const currentVersion = game.game_state.version || 0
      const gameUpdateResult = await supabase
        .from('games')
        .update({
          game_state: {
            ...game.game_state,
            version: currentVersion + 1, // ✅ 递增版本号
            public_zone: newPublicZone,
            current_turn: nextTurn,
            round_number: newRoundNumber,
            phase: 'action_select',
          }
        })
        .eq('id', game.id)
        .select()
        .single()
      
      if (gameUpdateResult.error) throw gameUpdateResult.error
      
      // ✅ 立即更新本地状态
      set({ 
        currentPlayer: playerUpdateResult.data,
        game: gameUpdateResult.data,
        loading: false 
      })
      
      Logger.game('出牌完成 版本:', currentVersion + 1, '新手牌数:', newHand.length, '公共区:', newPublicZone.length, '下一回合:', nextTurn)
      Logger.sync('本地状态已更新')
    } catch (error) {
      Logger.error('出牌失败:', error.message)
      set({ error: error.message, loading: false })
      // 刷新状态以同步数据库
      await get().refreshGameState()
      throw error
    }
  },

  // N换N：强制交换（公共区有N张时，用手牌N张换取公共区全部N张）
  forceSwap: async (selectedHandCards) => {
    const { game, currentPlayer } = get()
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你')
    }
    
    const publicZoneMax = game.hand_size ?? GAME_CONFIG.PUBLIC_ZONE_MAX
    const publicZone = game.game_state?.public_zone || []
    const N = publicZone.length
    
    // 验证：公共区不能为0或已满
    if (N === 0 || N >= publicZoneMax) {
      throw new Error('公共区数量不符合强制交换条件')
    }
    
    // 验证：选择的手牌数量必须等于N
    if (!selectedHandCards || selectedHandCards.length !== N) {
      throw new Error(`必须选择 ${N} 张手牌进行交换`)
    }
    
    try {
      set({ loading: true, error: null })
      
      Logger.user('强制交换操作 N:', N, '手牌数:', currentPlayer.hand.length)
      
      // 1. 交换：手牌的N张换公共区的N张，并按规则排序
      const newHand = sortHandForDisplay(
        currentPlayer.hand
          .filter(card => !selectedHandCards.some(sc => sc.id === card.id))
          .concat(publicZone)
      )
      
      const newPublicZone = [...selectedHandCards]
      
      // 2. 更新玩家手牌
      const playerUpdateResult = await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
        .select()
        .single()
      
      if (playerUpdateResult.error) throw playerUpdateResult.error
      
      // 3. 记录游戏动作
      await supabase
        .from('game_actions')
        .insert({
          game_id: game.id,
          player_id: currentPlayer.id,
          action_type: 'force_swap',
          action_data: {
            swapped_count: N,
            hand_cards_out: selectedHandCards,
            public_cards_in: publicZone
          }
        })
      
      // 4. 切换到下一个玩家，同时更新公共区和版本号
      const currentTurn = game.game_state?.current_turn || 0
      const roundNumber = game.game_state?.round_number || 0
      const players = get().players
      const nextTurn = (currentTurn + 1) % players.length
      const newRoundNumber = nextTurn === 0 ? roundNumber + 1 : roundNumber
      const currentVersion = game.game_state.version || 0
      
      const gameUpdateResult = await supabase
        .from('games')
        .update({
          game_state: {
            ...game.game_state,
            version: currentVersion + 1,
            public_zone: newPublicZone,
            current_turn: nextTurn,
            round_number: newRoundNumber,
            phase: 'action_select',
          }
        })
        .eq('id', game.id)
        .select()
        .single()
      
      if (gameUpdateResult.error) throw gameUpdateResult.error
      
      // ✅ 立即更新本地状态（乐观更新）
      set({ 
        currentPlayer: playerUpdateResult.data,
        game: gameUpdateResult.data,
        loading: false 
      })
      
      Logger.game('强制交换完成 版本:', currentVersion + 1, '新手牌数:', newHand.length, '下一回合:', nextTurn)
      Logger.sync('本地状态已更新')
    } catch (error) {
      Logger.error('强制交换失败:', error.message)
      set({ error: error.message, loading: false })
      // 刷新状态以同步数据库
      await get().refreshGameState()
      throw error
    }
  },

  // M换M：自由交换（公共区满5张时，选择M张手牌和M张公共区牌交换）
  selectiveSwap: async (selectedHandCards, selectedPublicCards) => {
    const { game, currentPlayer } = get()
    
    Logger.user('自由交换操作 手牌数:', selectedHandCards?.length, '公共区牌数:', selectedPublicCards?.length)
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你')
    }
    
    const publicZoneMax = game.hand_size ?? GAME_CONFIG.PUBLIC_ZONE_MAX
    const publicZone = game.game_state?.public_zone || []
    
    Logger.game('当前手牌数:', currentPlayer.hand.length, '公共区数:', publicZone.length)
    
    // 验证：公共区必须满 publicZoneMax 张才能自由交换
    if (publicZone.length !== publicZoneMax) {
      throw new Error(`公共区必须满${publicZoneMax}张才能自由交换`)
    }
    
    // 验证：数量必须匹配
    const M = selectedHandCards?.length || 0
    if (M === 0 || M > publicZoneMax) {
      throw new Error(`请选择1-${publicZoneMax}张手牌`)
    }
    
    if (selectedPublicCards?.length !== M) {
      throw new Error(`必须选择相同数量(${M}张)的公共区牌`)
    }
    
    try {
      set({ loading: true, error: null })
      
      // 1. 交换并按规则排序
      const newHand = sortHandForDisplay(
        currentPlayer.hand
          .filter(card => !selectedHandCards.some(sc => sc.id === card.id))
          .concat(selectedPublicCards)
      )
      
      const newPublicZone = publicZone
        .filter(card => !selectedPublicCards.some(sc => sc.id === card.id))
        .concat(selectedHandCards)
      
      Logger.game('换牌后手牌数:', newHand.length, '公共区数:', newPublicZone.length)
      
      // 2. 更新玩家手牌
      const playerUpdateResult = await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
        .select()
        .single()
      
      if (playerUpdateResult.error) throw playerUpdateResult.error
      
      // 3. 记录游戏动作
      await supabase
        .from('game_actions')
        .insert({
          game_id: game.id,
          player_id: currentPlayer.id,
          action_type: 'selective_swap',
          action_data: {
            swapped_count: M,
            hand_cards_out: selectedHandCards,
            public_cards_out: selectedPublicCards
          }
        })
      
      // 4. 切换到下一个玩家，同时更新公共区和版本号
      const currentTurn = game.game_state?.current_turn || 0
      const roundNumber = game.game_state?.round_number || 0
      const players = get().players
      const nextTurn = (currentTurn + 1) % players.length
      const newRoundNumber = nextTurn === 0 ? roundNumber + 1 : roundNumber
      const currentVersion = game.game_state.version || 0
      
      const gameUpdateResult = await supabase
        .from('games')
        .update({
          game_state: {
            ...game.game_state,
            version: currentVersion + 1,
            public_zone: newPublicZone,
            current_turn: nextTurn,
            round_number: newRoundNumber,
            phase: 'action_select',
          }
        })
        .eq('id', game.id)
        .select()
        .single()
      
      if (gameUpdateResult.error) throw gameUpdateResult.error
      
      // ✅ 立即更新本地状态（乐观更新）
      set({ 
        currentPlayer: playerUpdateResult.data,
        game: gameUpdateResult.data,
        loading: false 
      })
      
      Logger.game('自由交换完成 版本:', currentVersion + 1, '交换数量:', M, '下一回合:', nextTurn)
      Logger.sync('本地状态已更新')
    } catch (error) {
      Logger.error('自由交换失败:', error.message)
      set({ error: error.message, loading: false })
      // 刷新状态以同步数据库
      await get().refreshGameState()
      throw error
    }
  },

  // 弃牌（清场）：将公共区5张牌移入弃牌堆，不摸牌；回合保持，进入 action_select，玩家可选择摸牌或扣牌等
  clearPublicZone: async () => {
    const { game, currentPlayer } = get()
    
    Logger.user('弃牌操作开始 公共区数:', game?.game_state?.public_zone?.length)
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你')
    }
    
    const publicZoneMax = game.hand_size ?? GAME_CONFIG.PUBLIC_ZONE_MAX
    const publicZone = game.game_state?.public_zone || []
    const discardPile = game.game_state?.discard_pile || []
    
    Logger.game('弃牌前公共区:', publicZone.length, '弃牌堆:', discardPile.length)
    
    // 验证：公共区必须满 publicZoneMax 张才能弃牌
    if (publicZone.length !== publicZoneMax) {
      throw new Error(`公共区必须满${publicZoneMax}张才能弃牌`)
    }
    
    try {
      set({ loading: true, error: null })
      
      // 1. 公共区5张牌移入弃牌堆（不摸牌，牌堆不变，手牌不变）
      const newDiscardPile = [...discardPile, ...publicZone]
      
      Logger.game('移入弃牌堆:', publicZone.length, '新弃牌堆总数:', newDiscardPile.length)
      
      // 2. 更新游戏状态：清空公共区、更新弃牌堆，阶段改为 action_select（当前玩家可继续选择摸牌或扣牌等）
      const currentVersion = game.game_state.version || 0
      const gameUpdateResult = await supabase
        .from('games')
        .update({
          game_state: {
            ...game.game_state,
            version: currentVersion + 1,
            public_zone: [],
            discard_pile: newDiscardPile,
            phase: 'action_select',
          }
        })
        .eq('id', game.id)
        .select()
        .single()
      
      if (gameUpdateResult.error) throw gameUpdateResult.error
      
      Logger.network('游戏状态更新成功 版本:', currentVersion + 1, '公共区已清空')
      
      // 3. 记录游戏动作（不包含摸牌）
      await supabase
        .from('game_actions')
        .insert({
          game_id: game.id,
          player_id: currentPlayer.id,
          action_type: 'clear_zone',
          action_data: {
            cleared_cards: publicZone,
          }
        })
      
      // ✅ 立即更新本地状态（手牌未变，只更新 game）
      set({ 
        game: gameUpdateResult.data,
        loading: false 
      })
      
      Logger.game('弃牌完成 版本:', currentVersion + 1, '当前阶段: action_select，可摸牌或扣牌')
      Logger.sync('本地状态已更新')
    } catch (error) {
      Logger.error('弃牌操作失败:', error.message)
      set({ error: error.message, loading: false })
      await get().refreshGameState()
      throw error
    }
  },

  // 清场后出牌
  playAfterClear: async (selectedCards) => {
    const { game, currentPlayer } = get()
    
    Logger.user('清场后出牌 选中牌数:', selectedCards?.length, '公共区数:', game?.game_state?.public_zone?.length)
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你')
    }
    
    const currentPhase = game.game_state?.phase
    if (currentPhase !== 'play_after_clear') {
      throw new Error('当前不在清场后出牌阶段')
    }
    
    if (!selectedCards || selectedCards.length !== 1) {
      throw new Error('必须出1张牌')
    }
    
    try {
      set({ loading: true, error: null })
      
      // 1. 从手牌移除
      const newHand = currentPlayer.hand.filter(
        card => !selectedCards.some(sc => sc.id === card.id)
      )
      
      Logger.game('出牌后手牌数:', newHand.length)
      
      // 2. 加入公共区（清场后公共区应该只有这1张牌）
      const newPublicZone = [...selectedCards]
      
      Logger.game('新公共区数:', newPublicZone.length)
      
      // 3. 更新玩家手牌
      const playerUpdateResult = await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
        .select()
        .single()
      
      if (playerUpdateResult.error) {
        Logger.error('玩家更新失败:', playerUpdateResult.error.message)
        throw playerUpdateResult.error
      }
      
      Logger.network('玩家手牌更新成功')
      
      // 4. 记录游戏动作
      await supabase
        .from('game_actions')
        .insert({
          game_id: game.id,
          player_id: currentPlayer.id,
          action_type: 'play_after_clear',
          action_data: {
            cards: selectedCards
          }
        })
      
      Logger.network('游戏动作记录完成')
      
      // 5. 切换到下一个玩家，同时更新公共区和版本号
      const currentTurn = game.game_state?.current_turn || 0
      const roundNumber = game.game_state?.round_number || 0
      const players = get().players
      const nextTurn = (currentTurn + 1) % players.length
      const newRoundNumber = nextTurn === 0 ? roundNumber + 1 : roundNumber
      const currentVersion = game.game_state.version || 0
      
      const gameUpdateResult = await supabase
        .from('games')
        .update({
          game_state: {
            ...game.game_state,
            version: currentVersion + 1,
            public_zone: newPublicZone,
            current_turn: nextTurn,
            round_number: newRoundNumber,
            phase: 'action_select',
          }
        })
        .eq('id', game.id)
        .select()
        .single()
      
      if (gameUpdateResult.error) throw gameUpdateResult.error
      
      Logger.network('回合切换完成 版本:', currentVersion + 1, '下一回合:', nextTurn)
      
      // ✅ 立即更新本地状态（乐观更新）
      set({ 
        currentPlayer: playerUpdateResult.data,
        game: gameUpdateResult.data,
        loading: false 
      })
      
      Logger.game('清场后出牌完成 版本:', currentVersion + 1)
      Logger.sync('本地状态已更新')
    } catch (error) {
      Logger.error('清场后出牌失败:', error.message)
      set({ error: error.message, loading: false })
      // 刷新状态以同步数据库
      await get().refreshGameState()
      throw error
    }
  },

  // 扣牌功能
  knock: async () => {
    const { game, currentPlayer, players } = get()
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    // 🔧 验证状态一致性
    if (!get().validateGameState()) {
      Logger.warn('状态不一致 尝试刷新')
      await get().refreshGameState()
      
      // 再次验证
      if (!get().validateGameState()) {
        throw new Error('游戏状态不一致，请刷新页面')
      }
    }
    
    // 验证：是否轮到自己
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你')
    }
    
    // 验证：是否在游戏中
    if (game.status !== GAME_STATUS.PLAYING) {
      throw new Error('游戏未开始')
    }
    
    // 验证：是否满足扣牌条件
    const targetScore = game.game_state?.target_score || 40
    const handSize = game.hand_size ?? GAME_CONFIG.CARDS_PER_PLAYER
    const knockCheck = checkCanKnock(currentPlayer.hand, targetScore, handSize)
    
    if (!knockCheck.canKnock) {
      throw new Error(knockCheck.reason)
    }
    
    try {
      set({ loading: true, error: null })
      
      Logger.user('扣牌操作 玩家:', currentPlayer.nickname, '手牌数:', currentPlayer.hand.length)
      
      // 计算响应顺序（从扣牌者下家开始顺时针）
      const knockerPosition = currentPlayer.position
      const playerCount = players.length
      const responseOrder = []
      
      for (let i = 1; i < playerCount; i++) {
        responseOrder.push((knockerPosition + i) % playerCount)
      }
      
      Logger.game('响应顺序:', responseOrder.join(','))
      
      // 扣牌者的评估信息
      const knockerEvaluation = evaluateHand(currentPlayer.hand, targetScore, handSize)
      
      // 1. 更新游戏状态为 showdown（结束响应阶段）并递增版本号
      const currentVersion = game.game_state.version || 0
      const gameUpdateResult = await supabase
        .from('games')
        .update({
          status: GAME_STATUS.SHOWDOWN,
          game_state: {
            ...game.game_state,
            version: currentVersion + 1,
            phase: 'showdown',
            knocker_id: currentPlayer.id,
            knocker_position: currentPlayer.position,
            showdown_responses: {
              [currentPlayer.id]: {
                action: 'knock',
                is_mazi: false,
                responded_at: new Date().toISOString(),
                hand_snapshot: [...currentPlayer.hand],
                evaluation: knockerEvaluation,
              }
            },
            response_order: responseOrder,
            current_responder_position: responseOrder[0],
            all_responded: false,
          }
        })
        .eq('id', game.id)
        .select()
        .single()
      
      if (gameUpdateResult.error) throw gameUpdateResult.error
      
      // 2. 记录游戏动作
      await supabase
        .from('game_actions')
        .insert({
          game_id: game.id,
          player_id: currentPlayer.id,
          action_type: 'knock',
          action_data: {
            hand: currentPlayer.hand,
            hand_score: knockCheck.basicScore + targetScore,
            basic_score: knockCheck.basicScore
          }
        })
      
      // ✅ 立即更新本地状态（乐观更新）
      set({ 
        game: gameUpdateResult.data,
        loading: false 
      })
      
      Logger.game('扣牌完成 版本:', currentVersion + 1, '分数:', knockCheck.basicScore + targetScore)
      Logger.sync('本地状态已更新')
    } catch (error) {
      Logger.error('扣牌失败:', error.message)
      set({ error: error.message, loading: false })
      // 刷新状态以同步数据库
      await get().refreshGameState()
      throw error
    }
  },

  // 提交 showdown 响应
  respondShowdown: async (action) => {
    const { game, currentPlayer } = get()
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    // 🔧 验证状态一致性
    if (!get().validateGameState()) {
      Logger.warn('状态不一致 尝试刷新')
      await get().refreshGameState()
      
      // 再次验证
      if (!get().validateGameState()) {
        throw new Error('游戏状态不一致，请刷新页面')
      }
    }
    
    // 验证：必须在 showdown 阶段
    if (game.status !== GAME_STATUS.SHOWDOWN) {
      throw new Error('当前不在响应阶段')
    }
    
    // 验证：必须轮到自己响应
    const currentResponderPosition = game.game_state.current_responder_position
    if (currentPlayer.position !== currentResponderPosition) {
      throw new Error('还没轮到你响应')
    }
    
    // 验证：不能重复响应
    if (game.game_state.showdown_responses[currentPlayer.id]) {
      throw new Error('你已经响应过了')
    }
    
    try {
      set({ loading: true, error: null })
      
      Logger.user('响应操作 玩家:', currentPlayer.nickname, '动作:', action)
      
      // 1. 评估当前玩家的手牌
      const targetScore = game.game_state.target_score || 40
      const handSize = game.hand_size ?? GAME_CONFIG.CARDS_PER_PLAYER
      const playerStatus = getPlayerStatus(currentPlayer.hand, targetScore, handSize)
      
      Logger.game('手牌评估 是否麻子:', playerStatus.isMazi, '分数:', playerStatus.score)
      
      // 2. 验证：麻子只能选择随
      if (playerStatus.isMazi && action === SHOWDOWN_ACTIONS.CALL) {
        throw new Error('你是麻子，只能选择"随"')
      }
      
      // 3. 构建响应数据
      const responseData = {
        action,
        is_mazi: playerStatus.isMazi,
        responded_at: new Date().toISOString(),
        hand_snapshot: [...currentPlayer.hand],
        evaluation: playerStatus,
      }
      
      // 4. 计算下一个需要响应的玩家
      const responseOrder = game.game_state.response_order
      const currentIndex = responseOrder.indexOf(currentPlayer.position)
      const nextIndex = currentIndex + 1
      const isLastResponder = nextIndex >= responseOrder.length
      
      Logger.game('响应进度:', currentIndex + 1, '/', responseOrder.length, '是否最后:', isLastResponder)
      
      // 5. 更新数据库并递增版本号
      const updatedResponses = {
        ...game.game_state.showdown_responses,
        [currentPlayer.id]: responseData,
      }
      
      const currentVersion = game.game_state.version || 0
      const updateData = {
        game_state: {
          ...game.game_state,
          version: currentVersion + 1,
          showdown_responses: updatedResponses,
          current_responder_position: isLastResponder ? null : responseOrder[nextIndex],
          all_responded: isLastResponder,
        }
      }
      
      // 如果所有人都响应完毕，更新阶段
      if (isLastResponder) {
        updateData.game_state.phase = 'revealing'
        Logger.game('所有玩家已响应 进入亮牌阶段')
      }
      
      const gameUpdateResult = await supabase
        .from('games')
        .update(updateData)
        .eq('id', game.id)
        .select()
        .single()
      
      if (gameUpdateResult.error) throw gameUpdateResult.error
      
      // 6. 记录游戏动作
      await supabase
        .from('game_actions')
        .insert({
          game_id: game.id,
          player_id: currentPlayer.id,
          action_type: action === SHOWDOWN_ACTIONS.FOLD ? 'fold' : 'call',
          action_data: {
            hand: currentPlayer.hand,
            is_mazi: playerStatus.isMazi,
            evaluation: playerStatus
          }
        })
      
      // ✅ 立即更新本地状态（乐观更新）
      set({ 
        game: gameUpdateResult.data,
        loading: false 
      })
      
      Logger.game('响应完成 版本:', currentVersion + 1, '动作:', action)
      Logger.sync('本地状态已更新')
    } catch (error) {
      Logger.error('响应失败:', error.message)
      set({ error: error.message, loading: false })
      // 刷新状态以同步数据库
      await get().refreshGameState()
      throw error
    }
  },

  // 辅助函数：获取当前需要响应的玩家
  getCurrentResponder: () => {
    const { game, players } = get()
    if (!game || game.status !== GAME_STATUS.SHOWDOWN) return null
    
    const responderPosition = game.game_state?.current_responder_position
    if (responderPosition === null || responderPosition === undefined) return null
    
    return players.find(p => p.position === responderPosition)
  },

  // 辅助函数：检查当前玩家是否需要响应
  isMyTurnToRespond: () => {
    const { game, currentPlayer } = get()
    if (!game || !currentPlayer || game.status !== GAME_STATUS.SHOWDOWN) {
      return false
    }
    
    const responderPosition = game.game_state?.current_responder_position
    return currentPlayer.position === responderPosition
  },

  // 辅助函数：获取玩家的响应状态
  getPlayerResponseStatus: (playerId) => {
    const { game, players } = get()
    if (!game || game.status !== GAME_STATUS.SHOWDOWN) {
      return RESPONSE_STATUS.NOT_YET
    }
    
    const player = players.find(p => p.id === playerId)
    if (!player) return RESPONSE_STATUS.NOT_YET
    
    // 检查是否已响应
    if (game.game_state?.showdown_responses?.[playerId]) {
      return RESPONSE_STATUS.RESPONDED
    }
    
    // 检查是否轮到响应
    const responderPosition = game.game_state?.current_responder_position
    if (player.position === responderPosition) {
      return RESPONSE_STATUS.PENDING
    }
    
    return RESPONSE_STATUS.NOT_YET
  },

  // 辅助函数：获取扣牌者信息
  getKnockerInfo: () => {
    const { game, players } = get()
    if (!game || game.status !== GAME_STATUS.SHOWDOWN) return null
    
    const knockerId = game.game_state?.knocker_id
    return players.find(p => p.id === knockerId)
  },

  // 🔧 状态验证函数：检查游戏状态是否一致
  validateGameState: () => {
    const { game, currentPlayer, players } = get()
    
    if (!game || !currentPlayer) {
      Logger.warn('状态验证失败 缺少基本数据')
      return false
    }
    
    // 验证当前玩家是否在玩家列表中
    const playerExists = players.some(p => p.id === currentPlayer.id)
    if (!playerExists) {
      Logger.error('状态不一致 当前玩家不在列表 ID:', currentPlayer.id, '列表数:', players.length)
      return false
    }
    
    // 验证回合玩家是否存在（PLAYING 状态下）
    if (game.status === GAME_STATUS.PLAYING) {
      const currentTurn = game.game_state?.current_turn
      const turnPlayer = players.find(p => p.position === currentTurn)
      if (!turnPlayer) {
        Logger.error('状态不一致 回合玩家不存在 回合:', currentTurn, '玩家数:', players.length)
        return false
      }
    }
    
    // 验证 showdown 状态下的响应者
    if (game.status === GAME_STATUS.SHOWDOWN) {
      const responderPosition = game.game_state?.current_responder_position
      if (responderPosition !== null && responderPosition !== undefined) {
        const responder = players.find(p => p.position === responderPosition)
        if (!responder) {
          Logger.error('状态不一致 响应玩家不存在 位置:', responderPosition, '玩家数:', players.length)
          return false
        }
      }
    }
    
    Logger.sync('状态验证通过')
    return true
  },

  // 🔄 强制刷新游戏状态
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
      
      // 更新 currentPlayer
      const { currentPlayer } = get()
      let updatedCurrentPlayer = currentPlayer
      
      if (currentPlayer && playersResult.data) {
        const found = playersResult.data.find(p => p.id === currentPlayer.id)
        if (found) {
          updatedCurrentPlayer = found
        }
      }
      
      set({ 
        game: gameResult.data, 
        players: playersResult.data || [],
        currentPlayer: updatedCurrentPlayer
      })
      
      Logger.sync('状态刷新完成 状态:', gameResult.data?.status, '玩家数:', playersResult.data?.length, '版本:', gameResult.data?.game_state?.version)
    } catch (error) {
      Logger.error('刷新状态出错:', error.message)
    }
  },

  // 🎯 执行结算
  performSettlement: async () => {
    const { game, players } = get()
    
    if (!game || !players || players.length === 0) {
      throw new Error('游戏状态异常')
    }
    
    Logger.game('开始结算 游戏ID:', game.id, '玩家数:', players.length)
    
    try {
      set({ loading: true, error: null })
      
      // 1. 获取所有响应数据
      const responses = game.game_state.showdown_responses
      Logger.game('响应数据数量:', Object.keys(responses || {}).length)
      
      if (!responses) {
        throw new Error('没有响应数据')
      }
      
      // 2. 构建竞争池（只有砸的玩家参与比牌）
      const competitors = []
      const knockerId = game.game_state.knocker_id
      
      Logger.game('扣牌者ID:', knockerId)
      
      players.forEach(player => {
        const response = responses[player.id]
        if (!response) {
          Logger.warn('玩家没有响应数据 昵称:', player.nickname, 'ID:', player.id)
          return
        }
        
        Logger.game('玩家响应 昵称:', player.nickname, '动作:', response.action, '麻子:', response.is_mazi)
        
        // 只有非麻子且砸了的玩家参与比牌
        if ((response.action === 'knock' || response.action === 'call') && !response.is_mazi) {
          competitors.push({
            playerId: player.id,
            nickname: player.nickname,
            evaluation: response.evaluation,
            hand: response.hand_snapshot
          })
          Logger.game('加入竞争池 昵称:', player.nickname)
        }
      })
      
      Logger.game('竞争池玩家数:', competitors.length)
      
      // 3. 比牌确定胜负
      const winnerId = determineWinner(competitors, knockerId)
      Logger.game('比牌完成 赢家ID:', winnerId)
      
      const winner = players.find(p => p.id === winnerId)
      if (!winner) {
        throw new Error('找不到赢家信息')
      }
      
      Logger.game('赢家:', winner.nickname)
      
      // 4. 计算得分
      const targetScore = game.game_state.target_score || 40
      const scores = calculateScores(players, responses, winnerId, targetScore)
      
      Logger.game('得分计算完成 参与人数:', Object.keys(scores).length)
      
      // 5. 更新数据库 - 保存结算信息并递增版本号
      const currentVersion = game.game_state.version || 0
      const gameUpdateResult = await supabase
        .from('games')
        .update({
          status: GAME_STATUS.FINISHED,
          game_state: {
            ...game.game_state,
            version: currentVersion + 1,
            phase: 'settlement',
            settlement: {
              winner_id: winnerId,
              scores: scores,
              settled_at: new Date().toISOString(),
              round_number: game.game_state.round_number || 0
            }
          }
        })
        .eq('id', game.id)
        .select()
        .single()
      
      if (gameUpdateResult.error) throw gameUpdateResult.error
      
      // 6. 记录结算动作
      await supabase
        .from('game_actions')
        .insert({
          game_id: game.id,
          player_id: winnerId,
          action_type: 'settlement',
          action_data: {
            round: game.current_round,
            winner_id: winnerId,
            scores: scores
          }
        })
      
      // 7. 更新玩家积分（累计总分和每局得分）
      Logger.game('开始更新玩家积分 当前局:', game.current_round)
      
      const playerUpdatePromises = players.map(async (player) => {
        const roundScore = scores[player.id] || 0
        const newTotalScore = (player.total_score || 0) + roundScore
        const newRoundScores = [
          ...(player.round_scores || []),
          { round: game.current_round, score: roundScore }
        ]
        
        Logger.game('更新玩家积分 昵称:', player.nickname, '本局:', roundScore, '总分:', newTotalScore)
        
        return supabase
          .from('players')
          .update({
            total_score: newTotalScore,
            round_scores: newRoundScores
          })
          .eq('id', player.id)
      })
      
      await Promise.all(playerUpdatePromises)
      
      // 8. 更新游戏历史记录
      const newRoundHistory = [
        ...(game.round_history || []),
        {
          round: game.current_round,
          winner_id: winnerId,
          scores: scores,
          settled_at: new Date().toISOString()
        }
      ]
      
      await supabase
        .from('games')
        .update({
          round_history: newRoundHistory
        })
        .eq('id', game.id)
      
      Logger.game('历史记录已更新 总局数:', newRoundHistory.length)
      
      // ✅ 立即更新本地状态（乐观更新）
      set({ 
        game: gameUpdateResult.data,
        loading: false 
      })
      
      Logger.game('结算完成 版本:', currentVersion + 1, '赢家:', winner.nickname)
      Logger.sync('本地状态已更新')
      
      return {
        winnerId,
        winner,
        scores
      }
    } catch (error) {
      Logger.error('结算失败:', error.message)
      set({ error: error.message, loading: false })
      // 刷新状态以同步数据库
      await get().refreshGameState()
      throw error
    }
  },

  // 🎮 开始下一局
  startNextRound: async () => {
    const { game, players } = get()
    
    if (!game || !players || players.length === 0) {
      throw new Error('游戏状态异常')
    }
    
    Logger.game('准备开始下一局 当前:', game.current_round, '/', game.total_rounds)
    
    // 检查是否已经是最后一局
    if (game.current_round >= game.total_rounds) {
      Logger.game('已完成所有局数 无法开始下一局')
      throw new Error('游戏已结束，所有局数已完成')
    }
    
    try {
      set({ loading: true, error: null })
      
      // 1. 确定下一局的起始玩家（上局得分最低者）
      const sortedPlayers = [...players].sort((a, b) => {
        const scoreA = game.game_state.settlement?.scores[a.id] || 0
        const scoreB = game.game_state.settlement?.scores[b.id] || 0
        return scoreA - scoreB // 升序，得分最低的在前
      })
      
      const nextStartingPlayer = sortedPlayers[0]
      Logger.game('下一局起始玩家:', nextStartingPlayer.nickname, '上局得分:', game.game_state.settlement?.scores[nextStartingPlayer.id])
      
      const deckCount = game.deck_count ?? 1
      const handSize = game.hand_size ?? GAME_CONFIG.CARDS_PER_PLAYER
      
      // 2. 创建新牌堆并洗牌（支持多副牌）
      const deck = createDecks(deckCount)
      let shuffledDeck = shuffleDeck(deck)
      
      Logger.game('洗牌完成 牌堆数:', shuffledDeck.length)
      
      // 3. 给每个玩家发牌（起始玩家 handSize+1 张，其余 handSize 张）
      const dealPromises = players.map(async (player) => {
        const isStartingPlayer = player.id === nextStartingPlayer.id
        const cardsCount = isStartingPlayer ? handSize + 1 : handSize
        
        const { dealt, remaining } = dealCards(shuffledDeck, cardsCount)
        shuffledDeck = remaining
        
        const sortedHand = sortHandForDisplay(dealt)
        
        // 只更新手牌，不修改 position，避免位置唯一索引冲突
        const { error: playerError } = await supabase
          .from('players')
          .update({ hand: sortedHand })
          .eq('id', player.id)
        
        if (playerError) {
          Logger.error('发牌失败 玩家:', player.nickname, '错误:', playerError.message)
          throw playerError
        }
        
        Logger.game('发牌完成 玩家:', player.nickname, '是否起始玩家:', isStartingPlayer, '牌数:', cardsCount)
        
        return sortedHand
      })
      
      await Promise.all(dealPromises)
      
      // 5. 更新游戏状态 - 递增 current_round
      const nextRound = game.current_round + 1
      const targetScore = game.target_score || GAME_CONFIG.DEFAULT_TARGET_SCORE
      
      // 5. 更新游戏状态并返回最新 game 数据
      const { data: updatedGame, error: gameError } = await supabase
        .from('games')
        .update({
          status: GAME_STATUS.PLAYING,
          current_round: nextRound,
          game_state: {
            version: 1, // 新局重置版本号
            started_at: new Date().toISOString(),
            // 起始玩家直接用其原有 position，避免批量改位置导致冲突
            current_turn: nextStartingPlayer.position,
            round_number: 0,
            deck: shuffledDeck,
            public_zone: [],
            discard_pile: [],
            phase: 'first_play',
            target_score: targetScore,
          }
        })
        .eq('id', game.id)
        .select()
        .single()
      
      if (gameError) throw gameError
      
      Logger.game('下一局开始 第', nextRound, '/', game.total_rounds, '局')
      
      // 6. 主动查询最新的玩家数据，确保手牌是新发的这一局
      const { data: latestPlayers, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', game.id)
        .order('position')
      
      if (playersError) {
        Logger.error('获取下一局玩家数据失败:', playersError.message)
        // 即使玩家查询失败，也先结束 loading，避免前端卡死
        set({ loading: false })
        throw playersError
      }
      
      // 7. 同步更新 currentPlayer（保持当前登录玩家不变，只更新其最新数据）
      const { currentPlayer } = get()
      let updatedCurrentPlayer = currentPlayer
      
      if (currentPlayer && latestPlayers) {
        const found = latestPlayers.find(p => p.id === currentPlayer.id)
        if (found) {
          updatedCurrentPlayer = found
          Logger.sync('下一局本地玩家手牌数:', found.hand?.length)
        }
      }
      
      // 8. 直接更新本地 store，避免依赖异步订阅导致手牌仍显示上一局
      set({ 
        game: updatedGame,
        players: latestPlayers || [],
        currentPlayer: updatedCurrentPlayer,
        loading: false
      })
      
      Logger.sync('下一局状态本地已同步 当前局数:', updatedGame.current_round)
      
      return { round: nextRound }
    } catch (error) {
      Logger.error('开始下一局失败:', error.message)
      set({ error: error.message, loading: false })
      throw error
    }
  },

  // 🏆 检查游戏是否完全结束（所有局都完成）
  isGameFullyCompleted: () => {
    const { game } = get()
    if (!game) return false
    
    return game.current_round >= game.total_rounds && 
           game.status === GAME_STATUS.FINISHED
  },

  // 📊 获取游戏进度
  getGameProgress: () => {
    const { game } = get()
    if (!game || !game.total_rounds) return 0
    
    return Math.round((game.current_round / game.total_rounds) * 100)
  },
}))
