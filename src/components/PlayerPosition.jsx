import "./PlayerPosition.css";

export default function PlayerPosition({ player, position, isCurrentTurn }) {
  if (!player) return null;

  const cardCount = player.hand?.length || 0;

  return (
    <div className={`player-position player-position-${position}`}>
      <div className={`player-cards ${isCurrentTurn ? "current-turn" : ""}`}>
        {/* 卡片展示 */}
        <div className="cards-display">
          {Array.from({ length: cardCount }).map((_, index) => (
            <div
              key={index}
              className="card-back"
              style={{ "--index": index }}
            ></div>
          ))}
        </div>
        
        {/* 玩家名字在卡片底部 */}
        <div className="player-info-bottom">
          <span className="player-nickname">{player.nickname}</span>
        </div>
      </div>
    </div>
  );
}
