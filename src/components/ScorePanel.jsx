import { useGameStore } from '../stores/gameStore'
import './ScorePanel.css'

export default function ScorePanel({ isOpen, onClose }) {
  const { game, players } = useGameStore()
  
  if (!game || !players) return null
  
  const currentRound = game.current_round || 1
  const totalRounds = game.total_rounds || 4
  const roundHistory = game.round_history || []
  
  // 按总分排序玩家
  const sortedPlayers = [...players].sort((a, b) => {
    return (b.total_score || 0) - (a.total_score || 0)
  })
  
  return (
    <>
      {/* 遮罩层 */}
      {isOpen && (
        <div className="score-panel-overlay" onClick={onClose} />
      )}
      
      {/* 侧边面板 */}
      <div className={`score-panel ${isOpen ? 'open' : ''}`}>
        <div className="score-panel-header">
          <h3 className="score-panel-title">计分板</h3>
          <div className="game-progress">
            第 <span className="current-round">{currentRound}</span> / {totalRounds} 局
          </div>
        </div>
        
        <div className="score-panel-content">
          {/* 总分排行 */}
          <div className="total-scores-section">
            <h4 className="section-title">总分排行</h4>
            <div className="players-list">
              {sortedPlayers.map((player, index) => (
                <div key={player.id} className="player-score-row">
                  <div className="player-rank">{index + 1}</div>
                  <div className="player-name">{player.nickname}</div>
                  <div className="player-total-score">
                    {player.total_score || 0}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* 每局详情 */}
          {roundHistory.length > 0 && (
            <div className="round-history-section">
              <h4 className="section-title">每局详情</h4>
              <div className="rounds-list">
                {roundHistory.map((record, index) => {
                  const roundNum = record.round
                  const winnerPlayer = players.find(p => p.id === record.winner_id)
                  
                  return (
                    <div key={index} className="round-record">
                      <div className="round-header">
                        <span className="round-num">第 {roundNum} 局</span>
                        <span className="round-winner">
                          👑 {winnerPlayer?.nickname || '未知'}
                        </span>
                      </div>
                      <div className="round-scores">
                        {players.map(player => {
                          const score = record.scores?.[player.id] || 0
                          return (
                            <div key={player.id} className="round-score-item">
                              <span className="score-player-name">
                                {player.nickname}
                              </span>
                              <span className={`score-value ${score >= 0 ? 'positive' : 'negative'}`}>
                                {score >= 0 ? '+' : ''}{score}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          
          {roundHistory.length === 0 && (
            <div className="empty-history">
              <p>暂无历史记录</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
