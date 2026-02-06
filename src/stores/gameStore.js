import { create } from 'zustand'
import { supabase } from '../config/supabase'
import { generateRoomCode } from '../utils/roomCode'
import { GAME_CONFIG, GAME_STATUS } from '../constants/gameConfig'
import { createDeck, shuffleDeck, dealCards } from '../utils/cardUtils'

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
        (payload) => {
          set({ game: payload.new })
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
          const { data } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId)
            .order('position')
          
          if (data) {
            const { currentPlayer } = get()
            
            // 同步更新 currentPlayer
            if (currentPlayer) {
              const updatedCurrentPlayer = data.find(p => p.id === currentPlayer.id)
              if (updatedCurrentPlayer) {
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
      
      // 2. 给每个玩家发牌
      const dealPromises = players.map(async (player) => {
        const { dealt, remaining } = dealCards(shuffledDeck, GAME_CONFIG.CARDS_PER_PLAYER)
        shuffledDeck = remaining // 更新剩余牌堆
        
        // 手牌随机排序（不按点数排序，完全随机）
        const randomHand = [...dealt].sort(() => Math.random() - 0.5)
        
        // 更新玩家手牌
        await supabase
          .from('players')
          .update({ hand: randomHand })
          .eq('id', player.id)
        
        return randomHand
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
            deck: shuffledDeck, // 保存剩余牌堆
            phase: 'draw', // 初始阶段为摸牌
            current_plays: [], // 初始化出牌记录
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
    const nextTurn = (currentTurn + 1) % players.length
    
    const { error } = await supabase
      .from('games')
      .update({
        game_state: {
          ...game.game_state,
          current_turn: nextTurn,
          phase: 'draw', // 重置为摸牌阶段
        }
      })
      .eq('id', game.id)
    
    if (error) throw error
  },

  // 摸牌功能
  drawCard: async () => {
    const { game, currentPlayer } = get()
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    // 验证：是否轮到自己
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你摸牌')
    }

    // 验证：是否已经摸过牌了
    const currentPhase = game.game_state?.phase || 'draw'
    if (currentPhase === 'play') {
      throw new Error('已经摸过牌了，请出牌')
    }
    
    // 验证：牌堆是否还有牌
    const deck = game.game_state?.deck || []
    if (deck.length === 0) {
      throw new Error('牌堆已空')
    }
    
    try {
      set({ loading: true, error: null })
      
      // 1. 从牌堆顶部抽一张牌
      const drawnCard = deck[0]
      const remainingDeck = deck.slice(1)
      
      // 2. 将牌加入玩家手牌
      const newHand = [...currentPlayer.hand, drawnCard]
      
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
            phase: 'play', // 切换到出牌阶段
            last_action: {
              type: 'draw',
              player_id: currentPlayer.id,
              player_name: currentPlayer.nickname,
              timestamp: new Date().toISOString()
            }
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

  // 出牌功能
  playCards: async (selectedCards) => {
    const { game, currentPlayer, players } = get()
    
    if (!game || !currentPlayer) {
      throw new Error('游戏状态异常')
    }
    
    // 验证：是否轮到自己
    if (!get().isMyTurn()) {
      throw new Error('还没轮到你出牌')
    }

    // 验证：是否在出牌阶段
    const currentPhase = game.game_state?.phase || 'draw'
    if (currentPhase === 'draw') {
      throw new Error('请先摸牌')
    }
    
    // 验证：是否选择了牌
    if (!selectedCards || selectedCards.length === 0) {
      throw new Error('请选择要出的牌')
    }

    // 验证：只能出一张牌
    if (selectedCards.length > 1) {
      throw new Error('一次只能出一张牌')
    }
    
    try {
      set({ loading: true, error: null })
      
      // 1. 从手牌中移除已出的牌
      const newHand = currentPlayer.hand.filter(
        card => !selectedCards.some(sc => sc.id === card.id)
      )
      
      // 2. 更新玩家手牌
      await supabase
        .from('players')
        .update({ hand: newHand })
        .eq('id', currentPlayer.id)
      
      // 3. 记录出牌到游戏状态
      const currentPlays = game.game_state?.current_plays || []
      const newPlay = {
        player_id: currentPlayer.id,
        player_name: currentPlayer.nickname,
        player_position: currentPlayer.position,
        cards: selectedCards,
        played_at: new Date().toISOString()
      }
      
      // 4. 更新游戏状态 - 追加新出的牌
      const { error } = await supabase
        .from('games')
        .update({
          game_state: {
            ...game.game_state,
            current_plays: [...currentPlays, newPlay],
            last_action: {
              type: 'play',
              player_id: currentPlayer.id,
              player_name: currentPlayer.nickname,
              cards: selectedCards,
              timestamp: new Date().toISOString()
            }
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
          action_type: 'play_cards',
          action_data: {
            cards: selectedCards,
            hand_count: newHand.length
          }
        })
      
      // 6. 自动切换到下一个玩家
      await get().nextTurn()
      
      set({ loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
      throw error
    }
  },
}))
