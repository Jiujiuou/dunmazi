import { forwardRef, useImperativeHandle, useRef } from "react";
import Card from "./Card";
import DeckPile from "./DeckPile";
import "./PlayArea.css";

const PlayArea = forwardRef(function PlayArea(
  {
    publicZone = [],
    deckCount = 44,
    maxSlots = 5,
    onPublicCardClick = null,
    selectedPublicCards = [],
    cardsFromHandIds = [],
    hiddenPublicCardIds = [],
    deckRef: deckRefProp,
  },
  ref
) {
  const slotRefs = useRef([]);

  useImperativeHandle(ref, () => ({
    getSlotRect(index) {
      const el = slotRefs.current[index];
      return el ? el.getBoundingClientRect() : null;
    },
  }));

  return (
    <div className="play-area">
      {/* 左侧：摸牌堆（父组件用 deckRef 取位置做飞牌） */}
      <div ref={deckRefProp} className="deck-zone">
        <DeckPile remainingCards={deckCount} />
      </div>

      {/* 中央：公共区（卡槽数由本局 hand_size 决定） */}
      <div className="public-zone">
        {Array.from({ length: maxSlots }).map((_, index) => {
          const card = publicZone[index];
          const isSelected =
            card && selectedPublicCards.some((sc) => sc.id === card.id);
          const isClickable = card && onPublicCardClick;
          const isFromHand = card && cardsFromHandIds.includes(card.id);
          const isHidden = card && hiddenPublicCardIds.includes(card.id);

          return (
            <div
              key={`slot-${index}`}
              ref={(el) => {
                slotRefs.current[index] = el;
              }}
              className={`public-slot ${card ? "filled" : "empty"} ${isClickable ? "clickable" : ""} ${isSelected ? "selected" : ""}`}
              onClick={(e) => {
                if (isClickable) {
                  e.stopPropagation();
                  onPublicCardClick(card);
                }
              }}
            >
              {card ? (
                <div
                  className={`public-card-wrap ${isFromHand ? "card-from-hand" : ""} ${isHidden ? "public-card-hidden" : ""}`}
                >
                  <Card key={card.id} card={card} selected={false} />
                </div>
              ) : (
                <div className="slot-placeholder">
                  <span className="slot-number"></span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default PlayArea;
