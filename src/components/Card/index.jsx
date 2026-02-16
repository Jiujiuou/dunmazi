import { SUIT_DISPLAY } from '../../constants/cards'
import './Card.css'

export default function Card({ card, selected = false, onClick, small = false, tiny = false, micro = false }) {
  const isJoker = card.suit === 'joker'
  const suitInfo = SUIT_DISPLAY[card.suit]
  const isCompact = micro || tiny
  const sizeClass = micro ? 'card-micro' : tiny ? 'card-tiny' : small ? 'card-small' : ''
  const jokerVariant = isJoker && (card.rank === 'small' ? 'joker-small' : 'joker-big')

  /* 出牌记录用：小卡片只展示 1 个数字 + 1 个花色，上下竖排、水平居中 */
  if (isCompact) {
    return (
      <div
        className={`card card-compact ${isJoker ? 'joker' : ''} ${sizeClass}`}
        data-suit={isJoker ? undefined : card.suit}
        onClick={onClick}
      >
        <div className="card-compact-inner">
          {isJoker ? (
            <>
              <span className="card-compact-rank joker-text">JOKER</span>
              <span className={`card-compact-suit joker-symbol ${jokerVariant}`}>🃏</span>
            </>
          ) : (
            <>
              <span className="card-compact-rank">{card.rank}</span>
              <span className="card-compact-suit suit-large">{suitInfo?.symbol}</span>
            </>
          )}
        </div>
      </div>
    )
  }

  /* 手牌 / 公共区：左上、右下两处数字 + 正中大花色 */
  return (
    <div
      className={`card ${selected ? 'selected' : ''} ${isJoker ? 'joker' : ''} ${sizeClass}`}
      data-suit={isJoker ? undefined : card.suit}
      onClick={onClick}
    >
      <div className="card-inner">
        <div className="card-corner top-left">
          {isJoker ? (
            <span className="joker-text">JOKER</span>
          ) : (
            <div className="rank">{card.rank}</div>
          )}
        </div>
        <div className="card-center">
          {isJoker ? (
            <div className={`joker-symbol ${jokerVariant}`}>🃏</div>
          ) : (
            <div className="suit-large">{suitInfo?.symbol}</div>
          )}
        </div>
        <div className="card-corner bottom-right">
          {isJoker ? (
            <span className="joker-text">JOKER</span>
          ) : (
            <div className="rank">{card.rank}</div>
          )}
        </div>
      </div>
    </div>
  )
}
