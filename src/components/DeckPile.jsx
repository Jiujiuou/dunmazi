import './DeckPile.css'

export default function DeckPile({ remainingCards = 44 }) {
  // 计算显示的层数（每 5 张牌显示 1 层，最多 10 层）
  const layers = Math.min(Math.ceil(remainingCards / 5), 10)

  return (
    <div className="deck-pile">
      <div className="deck-stack" style={{ '--layers': layers }}>
        <div className="deck-count-back" style={{ '--layers': layers }}>
          {remainingCards}
        </div>
        {Array.from({ length: layers }).map((_, index) => (
          <div 
            key={index} 
            className="deck-layer"
            style={{ '--layer': index }}
          >
            <div className="card-back-pattern"></div>
          </div>
        ))}
      </div>
    </div>
  )
}

