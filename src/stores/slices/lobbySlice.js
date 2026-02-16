import { supabase } from '../../config/supabase'
import { GAME_CONFIG, GAME_STATUS } from '../../constants/gameConfig'
import { createDecks, shuffleDeck, dealCards, sortHandForDisplay } from '../../utils/cardUtils'
import Logger from '../../utils/logger'

/** 大厅：准备、开始游戏 */
export function lobbySlice(set, get) {
  return {
    toggleReady: async () => {
      const { currentPlayer, game } = get()
      if (!currentPlayer || !game) return
      try {
        const currentReady = currentPlayer.player_state?.isReady || false
        const { error } = await supabase
          .from('players')
          .update({
            player_state: { ...currentPlayer.player_state, isReady: !currentReady }
          })
          .eq('id', currentPlayer.id)
        if (error) throw error
      } catch (error) {
        set({ error: error.message })
        throw error
      }
    },

    startGame: async () => {
      const { game, players, currentPlayer } = get()
      if (!game || !currentPlayer) return
      if (!currentPlayer.player_state?.isHost) throw new Error('只有房主可以开始游戏')
      if (players.length < GAME_CONFIG.MIN_PLAYERS) throw new Error(`至少需要 ${GAME_CONFIG.MIN_PLAYERS} 名玩家`)
      const nonHostPlayers = players.filter(p => !p.player_state?.isHost)
      const allReady = nonHostPlayers.every(p => p.player_state?.isReady)
      if (!allReady) throw new Error('所有玩家都需要准备')
      try {
        set({ loading: true, error: null })
        const deckCount = game.deck_count ?? 1
        const handSize = game.hand_size ?? GAME_CONFIG.CARDS_PER_PLAYER
        const deck = createDecks(deckCount)
        let shuffledDeck = shuffleDeck(deck)
        const dealPromises = players.map(async (player) => {
          const isStartingPlayer = player.position === 0
          const cardsCount = isStartingPlayer ? handSize + 1 : handSize
          const { dealt, remaining } = dealCards(shuffledDeck, cardsCount)
          shuffledDeck = remaining
          const sortedHand = sortHandForDisplay(dealt)
          await supabase.from('players').update({ hand: sortedHand }).eq('id', player.id)
          return sortedHand
        })
        await Promise.all(dealPromises)
        const targetScore = game.target_score || GAME_CONFIG.DEFAULT_TARGET_SCORE
        const { error } = await supabase
          .from('games')
          .update({
            status: GAME_STATUS.PLAYING,
            game_state: {
              version: 1,
              started_at: new Date().toISOString(),
              current_turn: 0,
              round_number: 0,
              deck: shuffledDeck,
              public_zone: [],
              discard_pile: [],
              phase: 'first_play',
              target_score: targetScore,
            }
          })
          .eq('id', game.id)
        if (error) throw error
        Logger.game('游戏开始 版本: 1 玩家数:', players.length, '目标分:', targetScore)
        set({ loading: false })
      } catch (error) {
        set({ error: error.message, loading: false })
        throw error
      }
    },
  }
}
