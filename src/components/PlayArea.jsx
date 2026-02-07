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
        <DeckPile 
          remainingCards={deckCount}
        />
      </div>

      {/* 环形出牌区 */}
      <div className="played-cards-container">
        {/* 按玩家分组显示出牌 */}
        {players.map((player) => {
          // 获取该玩家的所有出牌
          const playerPlays = currentPlays.filter(play => play.player_id === player.id)
          
          if (playerPlays.length === 0) return null
          
          const position = getPlayerPosition(player)
          
          // 收集该玩家所有出过的牌
          const allCards = playerPlays.flatMap(play => play.cards || [])
          
          return (
            <div key={player.id} className={`played-cards played-cards-${position}`}>
              <div className="played-cards-inner">
                {allCards.map((card, index) => (
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
