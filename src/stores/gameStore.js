import { create } from 'zustand'
import { supabase } from '../config/supabase'
import { generateRoomCode } from '../utils/roomCode'
import { GAME_CONFIG, GAME_STATUS } from '../constants/gameConfig'

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
            set({ players: data })
          }
        }
      )
      .subscribe()
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
