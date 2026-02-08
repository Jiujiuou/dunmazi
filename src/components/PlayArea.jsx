import Card from './Card'
import DeckPile from './DeckPile'
import './PlayArea.css'

export default function PlayArea({ 
  publicZone = [], 
  deckCount = 44, 
  onPublicCardClick = null,
  selectedPublicCards = []
}) {
  const maxSlots = 5

  // 🔍 监听公共区变化
  console.log('PlayArea 渲染 - 公共区数据:', publicZone)
  console.log('PlayArea 渲染 - 公共区牌数:', publicZone.length)

  return (
    <div className="play-area">
      {/* 左侧：摸牌堆 */}
      <div className="deck-zone">
        <DeckPile remainingCards={deckCount} />
      </div>

      {/* 中央：公共区（5个卡槽） */}
      <div className="public-zone">
        {Array.from({ length: maxSlots }).map((_, index) => {
          const card = publicZone[index]
          const isSelected = card && selectedPublicCards.some(sc => sc.id === card.id)
          const isClickable = card && onPublicCardClick
          
          if (card) {
            console.log(`卡槽 ${index + 1}: 有牌`, card)
          }
          
          return (
            <div 
              key={`slot-${index}`}
              className={`public-slot ${card ? 'filled' : 'empty'} ${isClickable ? 'clickable' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={(e) => {
                if (isClickable) {
                  e.stopPropagation()
                  onPublicCardClick(card)
                }
              }}
            >
              {card ? (
                <Card 
                  key={card.id}
                  card={card} 
                  selected={false}
                />
              ) : (
                <div className="slot-placeholder">
                  <span className="slot-number">{index + 1}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
