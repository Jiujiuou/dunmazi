import { create } from 'zustand'
import { supabase } from '../config/supabase'
import { generateRoomCode } from '../utils/roomCode'
import { GAME_CONFIG, GAME_STATUS, SHOWDOWN_ACTIONS, RESPONSE_STATUS } from '../constants/gameConfig'
import { createDeck, shuffleDeck, dealCards, sortHandForDisplay } from '../utils/cardUtils'
import { canKnock as checkCanKnock, evaluateHand, getPlayerStatus } from '../utils/handEvaluation'

export const useGameStore = create((set, get) => ({
  currentPlayer: null,
  game: null,
  players: [],
  loading: false,
  error: null,

  createGame: async (nickname) => {
    set({ loading: true, error: null })
    
    try {
      const roomCode = generateRoomCode(GAME_CONFIG.ROOM_CODE_LENGTH)
      
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({
          room_code: roomCode,
          status: GAME_STATUS.WAITING,
          game_state: {},
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
      
      return game
    } catch (error) {
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
        })
        .select()
        .single()

      if (playerError) throw playerError

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
    console.log('🔔 开始订阅游戏:', gameId)
    
    supabase
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
          console.log('🔔 收到游戏状态更新:', payload.new)
          console.log('🔔 新的游戏状态:', payload.new?.status)
          console.log('🔔 新的阶段:', payload.new?.game_state?.phase)
          
          // ✅ 关键修复：立即查询最新的 players 数据，确保状态一致
          const { data: players } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId)
            .order('position')
          
          console.log('🔔 同步查询到的玩家数据:', players?.length, '个玩家')
          
          // 同步更新 currentPlayer
          const { currentPlayer } = get()
          let updatedCurrentPlayer = currentPlayer
          
          if (currentPlayer && players) {
            const found = players.find(p => p.id === currentPlayer.id)
            if (found) {
              updatedCurrentPlayer = found
              console.log('🔔 更新当前玩家手牌数:', found.hand?.length)
            }
          }
          
          // ✅ 原子性更新：同时更新 game 和 players，避免状态不一致
          set({ 
            game: payload.new,
            players: players || [],
            currentPlayer: updatedCurrentPlayer
          })
          
          console.log('✅ 状态同步完成')
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
        async () => {
          console.log('🔔 收到玩家数据更新（单独触发）')
          const { data } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId)
            .order('position')
          
          if (data) {
            console.log('🔔 更新后的玩家数据:', data)
            const { currentPlayer } = get()
            
            // 同步更新 currentPlayer
            if (currentPlayer) {
              const updatedCurrentPlayer = data.find(p => p.id === currentPlayer.id)
              if (updatedCurrentPlayer) {
                console.log('🔔 当前玩家手牌数:', updatedCurrentPlayer.hand?.length)
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
      .subscribe()
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
      
      // 1. 创建并洗牌
      const deck = createDeck()
      let shuffledDeck = shuffleDeck(deck)
      
      // 2. 给每个玩家发牌（起始玩家6张，其他人5张）
      const dealPromises = players.map(async (player, index) => {
        const isStartingPlayer = player.position === 0
        const cardsCount = isStartingPlayer ? 6 : GAME_CONFIG.CARDS_PER_PLAYER
        
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
      const { error } = await supabase
        .from('games')
        .update({
          status: GAME_STATUS.PLAYING,
          game_state: {
            started_at: new Date().toISOString(),
            current_turn: 0,
            round_number: 0, // 回合计数，从0开始
            deck: shuffledDeck, // 摸牌堆
            public_zone: [], // 公共区（0-5张）
            discard_pile: [], // 弃牌堆
            phase: 'first_play', // 首回合特殊阶段：直接出牌
            target_score: GAME_CONFIG.DEFAULT_TARGET_SCORE, // 设置目标分
          }
        })
        .eq('id', game.id)
      
      if (error) throw error
      
      set({ loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
      throw error
    }
  },

  leaveGame: async () => {
    const { currentPlayer } = get()
    
    if (currentPlayer) {
      await supabase
        .from('players')
        .delete()
        .eq('id', currentPlayer.id)
    }

    set({ 
      currentPlayer: null, 
      game: null, 
      players: [],
      error: null 
    })
  },

  clearError: () => set({ error: null }),

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
    const { game, currentPlayer } = get()
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    // 验证：是否轮到自己
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你')
    }

    // 验证：是否在正确的阶段（action_select 或 draw_and_play 都可以）
    const currentPhase = game.game_state?.phase || 'action_select'
    if (currentPhase !== 'action_select' && currentPhase !== 'draw_and_play') {
      throw new Error('当前不能摸牌')
    }
    
    // 验证：牌堆是否还有牌
    const deck = game.game_state?.deck || []
    if (deck.length === 0) {
      throw new Error('牌堆已空')
    }
    
    // 验证：公共区是否已满
    const publicZone = game.game_state?.public_zone || []
    if (publicZone.length >= GAME_CONFIG.PUBLIC_ZONE_MAX) {
      throw new Error('公共区已满，不能摸牌出牌')
    }
    
    try {
      set({ loading: true, error: null })
      
      // 1. 从牌堆顶部抽一张牌
      const drawnCard = deck[0]
      const remainingDeck = deck.slice(1)
      
      // 2. 将牌加入玩家手牌并按规则排序
      const newHand = sortHandForDisplay([...currentPlayer.hand, drawnCard])
      
      // 3. 更新玩家手牌
      await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
      
      // 4. 更新游戏状态（更新牌堆，切换到出牌阶段）
      const { error } = await supabase
        .from('games')
        .update({
          game_state: {
            ...game.game_state,
            deck: remainingDeck,
            phase: 'play_after_draw', // 切换到出牌阶段
          }
        })
        .eq('id', game.id)
      
      if (error) throw error
      
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
      
      set({ loading: false })
      
      return drawnCard
    } catch (error) {
      set({ error: error.message, loading: false })
      throw error
    }
  },

  // 出牌到公共区
  playToPublicZone: async (selectedCards) => {
    const { game, currentPlayer } = get()
    
    console.log('========== playToPublicZone 开始 ==========')
    console.log('选中的牌:', selectedCards)
    console.log('当前游戏状态:', game?.game_state)
    console.log('当前玩家手牌数量:', currentPlayer?.hand?.length)
    console.log('当前阶段 (phase):', game?.game_state?.phase)
    
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
    
    console.log('出牌前公共区:', publicZone)
    console.log('公共区牌数:', publicZone.length)
    
    // 验证：公共区容量
    if (publicZone.length >= GAME_CONFIG.PUBLIC_ZONE_MAX) {
      throw new Error('公共区已满')
    }
    
    // 验证阶段
    if (currentPhase !== 'first_play' && currentPhase !== 'play_after_draw') {
      console.error('阶段不匹配! 当前阶段:', currentPhase)
      throw new Error('当前不能出牌')
    }
    
    try {
      set({ loading: true, error: null })
      
      // 1. 从手牌中移除已出的牌
      const newHand = currentPlayer.hand.filter(
        card => !selectedCards.some(sc => sc.id === card.id)
      )
      
      console.log('出牌后新手牌数量:', newHand.length)
      
      // 2. 将牌加入公共区
      const newPublicZone = [...publicZone, ...selectedCards]
      
      console.log('出牌后新公共区:', newPublicZone)
      console.log('新公共区牌数:', newPublicZone.length)
      
      // 3. 更新玩家手牌
      console.log('开始更新玩家手牌...')
      const playerUpdateResult = await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
      
      if (playerUpdateResult.error) {
        console.error('玩家更新失败:', playerUpdateResult.error)
        throw playerUpdateResult.error
      }
      
      console.log('玩家手牌更新成功')
      
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
      
      console.log('游戏动作记录完成')
      
      // 5. 切换到下一个玩家，同时更新公共区
      console.log('准备切换回合并更新公共区...')
      await get().nextTurnWithState({ public_zone: newPublicZone })
      console.log('回合切换完成，公共区已更新')
      
      set({ loading: false })
      console.log('========== playToPublicZone 结束 ==========')
    } catch (error) {
      console.error('========== playToPublicZone 错误 ==========')
      console.error('错误信息:', error)
      set({ error: error.message, loading: false })
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
    
    const publicZone = game.game_state?.public_zone || []
    const N = publicZone.length
    
    // 验证：公共区不能为0或5
    if (N === 0 || N >= GAME_CONFIG.PUBLIC_ZONE_MAX) {
      throw new Error('公共区数量不符合强制交换条件')
    }
    
    // 验证：选择的手牌数量必须等于N
    if (!selectedHandCards || selectedHandCards.length !== N) {
      throw new Error(`必须选择 ${N} 张手牌进行交换`)
    }
    
    try {
      set({ loading: true, error: null })
      
      // 1. 交换：手牌的N张换公共区的N张，并按规则排序
      const newHand = sortHandForDisplay(
        currentPlayer.hand
          .filter(card => !selectedHandCards.some(sc => sc.id === card.id))
          .concat(publicZone)
      )
      
      const newPublicZone = [...selectedHandCards]
      
      // 2. 更新玩家手牌
      await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
      
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
      
      // 4. 切换到下一个玩家，同时更新公共区
      await get().nextTurnWithState({ public_zone: newPublicZone })
      
      set({ loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
      throw error
    }
  },

  // M换M：自由交换（公共区满5张时，选择M张手牌和M张公共区牌交换）
  selectiveSwap: async (selectedHandCards, selectedPublicCards) => {
    const { game, currentPlayer } = get()
    
    console.log('========== selectiveSwap 开始 ==========')
    console.log('选中的手牌:', selectedHandCards)
    console.log('选中的公共区牌:', selectedPublicCards)
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你')
    }
    
    const publicZone = game.game_state?.public_zone || []
    
    console.log('当前手牌:', currentPlayer.hand)
    console.log('当前公共区:', publicZone)
    
    // 验证：公共区必须满5张
    if (publicZone.length !== GAME_CONFIG.PUBLIC_ZONE_MAX) {
      throw new Error('公共区必须满5张才能自由交换')
    }
    
    // 验证：数量必须匹配
    const M = selectedHandCards?.length || 0
    if (M === 0 || M > GAME_CONFIG.PUBLIC_ZONE_MAX) {
      throw new Error(`请选择1-${GAME_CONFIG.PUBLIC_ZONE_MAX}张手牌`)
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
      
      console.log('换牌后新手牌:', newHand)
      console.log('换牌后新公共区:', newPublicZone)
      
      // 2. 更新玩家手牌
      await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
      
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
      
      // 4. 切换到下一个玩家，同时更新公共区
      await get().nextTurnWithState({ public_zone: newPublicZone })
      
      console.log('========== selectiveSwap 结束 ==========')
      
      set({ loading: false })
    } catch (error) {
      console.error('========== selectiveSwap 错误 ==========')
      console.error('错误信息:', error)
      set({ error: error.message, loading: false })
      throw error
    }
  },

  // 清场：将公共区5张牌移入弃牌堆，然后摸1打1
  clearPublicZone: async () => {
    const { game, currentPlayer } = get()
    
    console.log('========== clearPublicZone 开始 ==========')
    console.log('当前公共区:', game?.game_state?.public_zone)
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你')
    }
    
    const publicZone = game.game_state?.public_zone || []
    const discardPile = game.game_state?.discard_pile || []
    const deck = game.game_state?.deck || []
    
    console.log('清场前公共区牌数:', publicZone.length)
    
    // 验证：公共区必须满5张
    if (publicZone.length !== GAME_CONFIG.PUBLIC_ZONE_MAX) {
      throw new Error('公共区必须满5张才能清场')
    }
    
    // 验证：牌堆必须有牌
    if (deck.length === 0) {
      throw new Error('牌堆已空，无法清场')
    }
    
    try {
      set({ loading: true, error: null })
      
      // 1. 公共区5张牌移入弃牌堆
      const newDiscardPile = [...discardPile, ...publicZone]
      
      console.log('移入弃牌堆的牌数:', publicZone.length)
      console.log('新弃牌堆牌数:', newDiscardPile.length)
      
      // 2. 从牌堆摸1张并按规则排序
      const drawnCard = deck[0]
      const remainingDeck = deck.slice(1)
      const newHand = sortHandForDisplay([...currentPlayer.hand, drawnCard])
      
      console.log('摸到的牌:', drawnCard)
      console.log('新手牌数量:', newHand.length)
      
      // 3. 更新玩家手牌
      await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
      
      console.log('准备清空公共区并切换到 play_after_clear 阶段')
      
      // 4. 更新游戏状态（清空公共区，更新弃牌堆和牌堆，进入出牌阶段）
      const { error } = await supabase
        .from('games')
        .update({
          game_state: {
            ...game.game_state,
            public_zone: [],  // 清空公共区
            discard_pile: newDiscardPile,
            deck: remainingDeck,
            phase: 'play_after_clear', // 清场后必须出牌
          }
        })
        .eq('id', game.id)
      
      if (error) throw error
      
      console.log('游戏状态更新成功，公共区已清空')
      
      // 5. 记录游戏动作
      await supabase
        .from('game_actions')
        .insert({
          game_id: game.id,
          player_id: currentPlayer.id,
          action_type: 'clear_zone',
          action_data: {
            cleared_cards: publicZone,
            drawn_card: drawnCard
          }
        })
      
      set({ loading: false })
      console.log('========== clearPublicZone 结束 ==========')
      
      return drawnCard
    } catch (error) {
      console.error('========== clearPublicZone 错误 ==========')
      console.error('错误信息:', error)
      set({ error: error.message, loading: false })
      throw error
    }
  },

  // 清场后出牌
  playAfterClear: async (selectedCards) => {
    const { game, currentPlayer } = get()
    
    console.log('========== playAfterClear 开始 ==========')
    console.log('选中的牌:', selectedCards)
    console.log('当前公共区:', game?.game_state?.public_zone)
    
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
      
      console.log('出牌后新手牌数量:', newHand.length)
      
      // 2. 加入公共区（清场后公共区应该只有这1张牌）
      const newPublicZone = [...selectedCards]
      
      console.log('清场后新公共区:', newPublicZone)
      console.log('新公共区牌数:', newPublicZone.length)
      
      // 3. 更新玩家手牌
      console.log('开始更新玩家手牌...')
      const playerUpdateResult = await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
      
      if (playerUpdateResult.error) {
        console.error('玩家更新失败:', playerUpdateResult.error)
        throw playerUpdateResult.error
      }
      
      console.log('玩家手牌更新成功')
      
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
      
      console.log('游戏动作记录完成')
      
      // 5. 切换到下一个玩家，同时更新公共区
      console.log('准备切换回合并更新公共区...')
      await get().nextTurnWithState({ public_zone: newPublicZone })
      console.log('回合切换完成，公共区已更新')
      
      set({ loading: false })
      console.log('========== playAfterClear 结束 ==========')
    } catch (error) {
      console.error('========== playAfterClear 错误 ==========')
      console.error('错误信息:', error)
      set({ error: error.message, loading: false })
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
      console.warn('⚠️ 状态不一致，尝试刷新...')
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
    const knockCheck = checkCanKnock(currentPlayer.hand, targetScore)
    
    if (!knockCheck.canKnock) {
      throw new Error(knockCheck.reason)
    }
    
    try {
      set({ loading: true, error: null })
      
      // 计算响应顺序（从扣牌者下家开始顺时针）
      const knockerPosition = currentPlayer.position
      const playerCount = players.length
      const responseOrder = []
      
      for (let i = 1; i < playerCount; i++) {
        responseOrder.push((knockerPosition + i) % playerCount)
      }
      
      // 扣牌者的评估信息
      const knockerEvaluation = evaluateHand(currentPlayer.hand, targetScore)
      
      // 1. 更新游戏状态为 showdown（结束响应阶段）
      const { error } = await supabase
        .from('games')
        .update({
          status: GAME_STATUS.SHOWDOWN, // 更新 status 为 showdown
          game_state: {
            ...game.game_state,
            phase: 'showdown', // 同时更新 phase
            knocker_id: currentPlayer.id, // 记录扣牌者
            knocker_position: currentPlayer.position,
            showdown_responses: {
              // 先记录扣牌者
              [currentPlayer.id]: {
                action: 'knock',
                is_mazi: false,
                responded_at: new Date().toISOString(),
                hand_snapshot: [...currentPlayer.hand],
                evaluation: knockerEvaluation,
              }
            },
            response_order: responseOrder,
            current_responder_position: responseOrder[0], // 第一个需要响应的玩家
            all_responded: false,
          }
        })
        .eq('id', game.id)
      
      if (error) throw error
      
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
      
      set({ loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
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
      console.warn('⚠️ 状态不一致，尝试刷新...')
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
      
      // 1. 评估当前玩家的手牌
      const targetScore = game.game_state.target_score || 40
      const playerStatus = getPlayerStatus(currentPlayer.hand, targetScore)
      
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
      
      // 5. 更新数据库
      const updatedResponses = {
        ...game.game_state.showdown_responses,
        [currentPlayer.id]: responseData,
      }
      
      const updateData = {
        game_state: {
          ...game.game_state,
          showdown_responses: updatedResponses,
          current_responder_position: isLastResponder ? null : responseOrder[nextIndex],
          all_responded: isLastResponder,
        }
      }
      
      // 如果所有人都响应完毕，更新阶段
      if (isLastResponder) {
        updateData.game_state.phase = 'revealing'  // 亮牌阶段
      }
      
      const { error } = await supabase
        .from('games')
        .update(updateData)
        .eq('id', game.id)
      
      if (error) throw error
      
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
      
      set({ loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
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
      console.warn('⚠️ 状态验证：缺少基本数据')
      return false
    }
    
    // 验证当前玩家是否在玩家列表中
    const playerExists = players.some(p => p.id === currentPlayer.id)
    if (!playerExists) {
      console.error('❌ 状态不一致：当前玩家不在玩家列表中')
      console.error('当前玩家ID:', currentPlayer.id)
      console.error('玩家列表:', players.map(p => p.id))
      return false
    }
    
    // 验证回合玩家是否存在（PLAYING 状态下）
    if (game.status === GAME_STATUS.PLAYING) {
      const currentTurn = game.game_state?.current_turn
      const turnPlayer = players.find(p => p.position === currentTurn)
      if (!turnPlayer) {
        console.error('❌ 状态不一致：回合玩家不存在')
        console.error('当前回合:', currentTurn)
        console.error('玩家位置:', players.map(p => p.position))
        return false
      }
    }
    
    // 验证 showdown 状态下的响应者
    if (game.status === GAME_STATUS.SHOWDOWN) {
      const responderPosition = game.game_state?.current_responder_position
      if (responderPosition !== null && responderPosition !== undefined) {
        const responder = players.find(p => p.position === responderPosition)
        if (!responder) {
          console.error('❌ 状态不一致：响应玩家不存在')
          console.error('响应者位置:', responderPosition)
          console.error('玩家位置:', players.map(p => p.position))
          return false
        }
      }
    }
    
    console.log('✅ 状态验证通过')
    return true
  },

  // 🔄 强制刷新游戏状态
  refreshGameState: async () => {
    const { game } = get()
    if (!game) {
      console.warn('⚠️ 无法刷新：没有游戏数据')
      return
    }
    
    console.log('🔄 强制刷新游戏状态...')
    
    try {
      const [gameResult, playersResult] = await Promise.all([
        supabase.from('games').select('*').eq('id', game.id).single(),
        supabase.from('players').select('*').eq('game_id', game.id).order('position')
      ])
      
      if (gameResult.error) {
        console.error('刷新游戏数据失败:', gameResult.error)
        return
      }
      
      if (playersResult.error) {
        console.error('刷新玩家数据失败:', playersResult.error)
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
      
      console.log('✅ 状态刷新完成')
      console.log('游戏状态:', gameResult.data?.status)
      console.log('玩家数量:', playersResult.data?.length)
    } catch (error) {
      console.error('刷新状态时出错:', error)
    }
  },
}))
