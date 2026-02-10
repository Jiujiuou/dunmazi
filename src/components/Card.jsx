import { SUIT_DISPLAY } from '../constants/cards'
import './Card.css'

export default function Card({ card, selected = false, onClick, small = false, tiny = false, micro = false }) {
  const isJoker = card.suit === 'joker'
  const suitInfo = SUIT_DISPLAY[card.suit]
  const sizeClass = micro ? 'card-micro' : tiny ? 'card-tiny' : small ? 'card-small' : ''
  
  return (
    <div 
      className={`card ${selected ? 'selected' : ''} ${isJoker ? 'joker' : ''} ${sizeClass}`}
      onClick={onClick}
    >
      <div className="card-inner">
        {/* 左上角 */}
        <div className="card-corner top-left">
          {isJoker ? (
            <span className="joker-text">
              JOKER
            </span>
          ) : (
            <div className="rank" style={{ color: suitInfo?.color }}>
              {card.rank}
            </div>
          )}
        </div>
        
        {/* 中央 */}
        <div className="card-center">
          {isJoker ? (
            <div className="joker-symbol" style={{ 
              color: card.rank === 'small' ? '#10b981' : '#ef4444' 
            }}>
              🃏
            </div>
          ) : (
            <div className="suit-large" style={{ color: suitInfo?.color }}>
              {suitInfo?.symbol}
            </div>
          )}
        </div>
        
        {/* 右下角 */}
        <div className="card-corner bottom-right">
          {isJoker ? (
            <span className="joker-text">
              JOKER
            </span>
          ) : (
            <div className="rank" style={{ color: suitInfo?.color }}>
              {card.rank}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
