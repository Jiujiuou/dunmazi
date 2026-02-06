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
}))
