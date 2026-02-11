import { evaluateHand } from '../utils/handEvaluation'
import { SUIT_DISPLAY } from '../constants/cards'
import './HandInfo.css'

export default function HandInfo({ hand, targetScore }) {
  const evaluation = evaluateHand(hand, targetScore)
  
  const {
    handScore,
    isFlush,
    suit,
  } = evaluation
  
  // 判断是否为麻子
  const isMazi = !isFlush || handScore < targetScore
  
  return (
    <div className={`hand-info ${isMazi ? 'mazi' : 'safe'}`}>
      {/* 状态标题 */}
      <div className="status-title">
        {isMazi ? '麻子' : (
          <span className={suit ? `hand-info-suit hand-info-suit-${suit}` : ''}>
            {SUIT_DISPLAY[suit]?.symbol} {SUIT_DISPLAY[suit]?.name}
          </span>
        )}
      </div>
      
      {/* 手牌分数（只有非麻子才显示） */}
      {!isMazi && (
        <>
          <div className="info-row">
            <span className="info-label">手牌分数</span>
            <span className="info-value score-value">
              {handScore}
            </span>
          </div>
          
          <div className="info-row">
            <span className="info-label">得分</span>
            <span className="info-value score-value">
              {handScore - targetScore}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
