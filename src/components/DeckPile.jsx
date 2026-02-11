import './DeckPile.css'

export default function DeckPile({ remainingCards = 44 }) {
  return (
    <div className={`deck-pile ${remainingCards === 0 ? 'empty' : ''}`}>
      {remainingCards > 0 ? (
        <div className="deck-single">
          <div className="deck-card-back" />
          <div className="deck-count" aria-label={`剩余 ${remainingCards} 张牌`}>
            {remainingCards}
          </div>
        </div>
      ) : (
        <div className="deck-empty">
          <span className="empty-icon" aria-hidden>🃏</span>
          <span className="empty-text">牌堆已空</span>
        </div>
      )}
    </div>
  )
}
