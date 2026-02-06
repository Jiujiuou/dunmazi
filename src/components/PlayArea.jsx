import Card from './Card'
import DeckPile from './DeckPile'
import './PlayArea.css'

export default function PlayArea({ currentPlays = [], deckCount = 44, players = [], currentPlayerId }) {
  // 获取玩家相对位置映射
  const getPlayerPosition = (player) => {
    if (player.id === currentPlayerId) return 'bottom'
    
    const allPlayers = players.slice().sort((a, b) => a.position - b.position)
    const myIndex = allPlayers.findIndex(p => p.id === currentPlayerId)
    const playerIndex = allPlayers.findIndex(p => p.id === player.id)
    
    const relativePosition = (playerIndex - myIndex + players.length) % players.length
    
    // 根据玩家数量映射位置
    const positionMaps = {
      2: { 1: 'top' },
      3: { 1: 'top-right', 2: 'top-left' },
      4: { 1: 'right', 2: 'top', 3: 'left' }
    }
    
    return positionMaps[players.length]?.[relativePosition] || 'top'
  }

  return (
    <div className="play-area">
      {/* 中央牌堆 */}
      <div className="play-area-center">
        <DeckPile remainingCards={deckCount} />
      </div>

      {/* 环形出牌区 */}
      <div className="played-cards-container">
        {currentPlays.map((play) => {
          const player = players.find(p => p.id === play.player_id)
          const position = player ? getPlayerPosition(player) : 'bottom'
          
          return (
            <div key={play.player_id} className={`played-cards played-cards-${position}`}>
              <div className="played-cards-inner">
                {play.cards?.map((card, index) => (
                  <Card key={`${card.id}-${index}`} card={card} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
