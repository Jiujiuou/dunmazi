import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGameStore } from "../../stores/gameStore";
import {
  GAME_STATUS,
  GAME_CONFIG,
  SHOWDOWN_ACTIONS,
} from "../../constants/gameConfig";
import {
  canKnock as checkCanKnock,
  getPlayerStatus,
} from "../../utils/handEvaluation";
import Card from "../Card";
import PlayerPosition from "../PlayerPosition";
import PlayArea from "../PlayArea";
import ShowdownBanner from "../ShowdownBanner";
import SettlementModal from "../SettlementModal";
import ScorePanel from "../ScorePanel";
import ActionLog from "../ActionLog";
import WaitingRoom from "../game/WaitingRoom";
import {
  HiOutlineChartBarSquare,
  HiOutlineArrowPath,
  HiOutlineHandRaised,
  HiOutlineHandThumbUp,
  HiOutlineExclamationTriangle,
} from "react-icons/hi2";
import Logger from "../../utils/logger";
import "./GameRoom.css";

export default function GameRoom() {
  const {
    game,
    currentPlayer,
    players,
    leaveGame,
    toggleReady,
    startGame,
    drawCard,
    playToPublicZone,
    forceSwap,
    selectiveSwap,
    clearPublicZone,
    playAfterClear,
    knock,
    respondShowdown,
    isMyTurnToRespond,
    getCurrentTurnPlayer,
    isMyTurn,
    refreshGameState,
    performSettlement,
    startNextRound,
    loading,
    error,
    clearError,
  } = useGameStore();

  const [selectedCards, setSelectedCards] = useState([]);
  const [selectedPublicCards, setSelectedPublicCards] = useState([]);
  const [roomCodeCopied, setRoomCodeCopied] = useState(false);
  const [swapMode, setSwapMode] = useState(null); // 'force' | 'selective' | null
  const [settlementData, setSettlementData] = useState(null); // 结算数据
  const [scorePanelOpen, setScorePanelOpen] = useState(false); // 计分板面板
  const [drawInProgress, setDrawInProgress] = useState(false); // 摸牌流程已开始，在 store 更新前就为 true，用于避免「先亮再灭」
  const [lastDrawnCardId, setLastDrawnCardId] = useState(null); // 刚摸到的牌 id，用于飞牌测量与结束清理
  const [swapJustDone, setSwapJustDone] = useState(null); // { fromPublicToHand: ids[], fromHandToPublic: ids[] } 换牌后动画
  const [flyingDraw, setFlyingDraw] = useState(null); // { card, fromRect, toRect } 摸牌飞牌
  const [flyingDrawStarted, setFlyingDrawStarted] = useState(false); // 飞牌动画是否已触发
  const [flyingPlay, setFlyingPlay] = useState(null); // [{ card, fromRect, toRect }] 出牌飞牌
  const [flyingPlayStarted, setFlyingPlayStarted] = useState(false);
  const [flyingHandToPublic, setFlyingHandToPublic] = useState(null); // 换牌：手牌→公共区
  const [flyingHandToPublicStarted, setFlyingHandToPublicStarted] = useState(false);
  const [flyingPublicToHand, setFlyingPublicToHand] = useState(null); // 换牌：公共区→手牌 [{ card, fromRect, toRect? }]，toRect 在 effect 中测量
  const [flyingPublicToHandStarted, setFlyingPublicToHandStarted] = useState(false);

  const deckRef = useRef(null);
  const handCardRef = useRef(null); // 刚摸到的那张牌在手中的 wrapper
  const handCardRefs = useRef({}); // 每张手牌的 wrapper，用于出牌时取位置
  const playAreaRef = useRef(null); // getSlotRect(i)
  const previousHandRef = useRef([]); // 上一帧的手牌，用于在 store 先于 setState 更新时仍能识别「新牌」并隐藏

  const isHost = currentPlayer?.player_state?.isHost;
  const isReady = currentPlayer?.player_state?.isReady || false;

  const nonHostPlayers = players.filter((p) => !p.player_state?.isHost);
  const readyCount = nonHostPlayers.filter(
    (p) => p.player_state?.isReady,
  ).length;
  const allReady =
    nonHostPlayers.length > 0 &&
    nonHostPlayers.every((p) => p.player_state?.isReady);
  const canStart =
    isHost && players.length >= GAME_CONFIG.MIN_PLAYERS && allReady;

  // 选牌逻辑
  const toggleCardSelection = (card) => {
    setSelectedCards((prev) => {
      const isSelected = prev.some((c) => c.id === card.id);

      // 如果已选中，则取消选中；否则加入选中
      if (isSelected) {
        return prev.filter((c) => c.id !== card.id);
      } else {
        return [...prev, card];
      }
    });
  };

  // 公共区选牌
  const togglePublicCardSelection = (card) => {
    setSelectedPublicCards((prev) => {
      const isSelected = prev.some((c) => c.id === card.id);
      if (isSelected) {
        return prev.filter((c) => c.id !== card.id);
      } else {
        return [...prev, card];
      }
    });
  };

  const handleCardClick = (card, e) => {
    e.stopPropagation();
    toggleCardSelection(card);
  };

  useEffect(() => {
    setSelectedCards([]);
    setSelectedPublicCards([]);
    setSwapMode(null);
  }, [game?.status]);

  // 每轮渲染后同步「上一帧手牌」，用于摸牌时用 previousHand 推导新牌（避免 store 先于 setState 导致的一帧闪动）
  useEffect(() => {
    previousHandRef.current = currentPlayer?.hand ?? [];
  });

  // 摸牌飞牌：在 lastDrawnCardId 且手牌已渲染后测量牌堆与目标位，启动飞牌
  useEffect(() => {
    if (!lastDrawnCardId || !currentPlayer?.hand?.length) return;
    const card = currentPlayer.hand.find((c) => c.id === lastDrawnCardId);
    if (!card) return;

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fromRect = deckRef.current?.getBoundingClientRect?.();
        const toRect = handCardRef.current?.getBoundingClientRect?.();
        if (fromRect && toRect) {
          setFlyingDrawStarted(false);
          setFlyingDraw({ card, fromRect, toRect });
        } else {
          setLastDrawnCardId(null);
          setDrawInProgress(false);
        }
      });
    });
    return () => cancelAnimationFrame(id);
  }, [lastDrawnCardId, currentPlayer?.hand]);

  // 摸牌飞牌：挂上 flyingDraw 后下一帧触发位移动画
  useEffect(() => {
    if (!flyingDraw) return;
    const id = requestAnimationFrame(() => setFlyingDrawStarted(true));
    return () => cancelAnimationFrame(id);
  }, [flyingDraw]);

  // 方案二 fallback：手牌由 Realtime 更新，若订阅延迟/丢包，超时后拉取一次状态
  useEffect(() => {
    if (!lastDrawnCardId) return;
    const t = setTimeout(() => refreshGameState(), 2500);
    return () => clearTimeout(t);
  }, [lastDrawnCardId, refreshGameState]);

  // 换牌：公共区→手牌 的 toRect 在 DOM 更新后测量（新 hand 已渲染）
  useEffect(() => {
    if (!flyingPublicToHand?.length || !currentPlayer?.hand?.length) return;
    const needToRects = flyingPublicToHand.some((item) => !item.toRect);
    if (!needToRects) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const withToRects = flyingPublicToHand.map((item) => {
          if (item.toRect) return item;
          const el = handCardRefs.current[item.card.id];
          const toRect = el?.getBoundingClientRect?.() ?? null;
          return { ...item, toRect };
        });
        if (withToRects.every((item) => item.toRect)) {
          setFlyingPublicToHand(withToRects);
          setFlyingPublicToHandStarted(false);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setFlyingPublicToHandStarted(true));
          });
        }
      });
    });
    return () => cancelAnimationFrame(id);
  }, [flyingPublicToHand, currentPlayer?.hand]);

  // 换牌飞牌：若 onTransitionEnd 未触发（如节点不可见），超时清理避免状态残留
  useEffect(() => {
    if (!flyingHandToPublic?.length && !flyingPublicToHand?.length) return;
    const t = setTimeout(() => {
      setFlyingHandToPublic(null);
      setFlyingHandToPublicStarted(false);
      setFlyingPublicToHand(null);
      setFlyingPublicToHandStarted(false);
      setSwapJustDone(null);
    }, 700);
    return () => clearTimeout(t);
  }, [!!flyingHandToPublic?.length, !!flyingPublicToHand?.length]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // 自动触发结算：当所有玩家响应完毕时
  useEffect(() => {
    const shouldTriggerSettlement =
      game?.game_state?.phase === "revealing" &&
      game?.game_state?.all_responded === true &&
      !settlementData; // 避免重复触发

    if (shouldTriggerSettlement) {
      Logger.game("检测到所有玩家响应完毕 准备结算");

      // 延迟1秒后执行结算，让玩家看到最后一个响应
      const timer = setTimeout(async () => {
        try {
          Logger.game("开始执行结算");
          const result = await performSettlement();
          Logger.game("结算完成 赢家:", result.winner?.nickname);

          // 保存结算数据到本地状态
          setSettlementData(result);
        } catch (err) {
          Logger.error("结算失败:", err.message);
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [
    game?.game_state?.phase,
    game?.game_state?.all_responded,
    settlementData,
    performSettlement,
  ]);

  const handleLeave = async () => {
    if (confirm("确定要离开房间吗?")) {
      await leaveGame();
    }
  };

  const handleToggleReady = async () => {
    try {
      await toggleReady();
    } catch (err) {
      Logger.error("切换准备状态失败:", err.message);
    }
  };

  const handleStartGame = async () => {
    try {
      await startGame();
    } catch (err) {
      Logger.error("开始游戏失败:", err.message);
    }
  };

  const handleCopyRoomCode = async () => {
    if (game?.room_code) {
      await navigator.clipboard.writeText(game.room_code);
      setRoomCodeCopied(true);
      setTimeout(() => setRoomCodeCopied(false), 2000);
    }
  };

  const handleShareLink = async () => {
    if (game?.room_code) {
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${game.room_code}`;
      await navigator.clipboard.writeText(shareUrl);
      setRoomCodeCopied(true);
      setTimeout(() => setRoomCodeCopied(false), 2000);
    }
  };

  // 摸1打1 - 摸牌（先设 drawInProgress，再请求，避免 store 触发的重渲染早于 setState 导致新牌先亮一帧）
  const handleDrawCard = async () => {
    const publicZoneMax = game?.hand_size ?? GAME_CONFIG.PUBLIC_ZONE_MAX;
    const publicZone = game?.game_state?.public_zone || [];
    if (publicZone.length >= publicZoneMax) {
      try {
        throw new Error("公共区已满，不能摸牌");
      } catch (err) {
        Logger.error("摸牌失败:", err.message);
      }
      return;
    }

    setDrawInProgress(true);
    try {
      const drawn = await drawCard();
      if (drawn?.id) setLastDrawnCardId(drawn.id);
    } catch (err) {
      Logger.error("摸牌失败:", err.message);
      setDrawInProgress(false);
    }
  };

  // 摸1打1 - 出牌 / 首回合出牌（先取手牌与公共区槽位坐标，再请求，最后播飞牌动画）
  const handlePlayCard = async () => {
    if (selectedCards.length === 0) return;

    Logger.game(
      "准备出牌 选中牌数:",
      selectedCards.length,
      "游戏阶段:",
      game?.game_state?.phase,
      "手牌数:",
      currentPlayer?.hand?.length,
    );

    try {
      const publicZone = game?.game_state?.public_zone || [];
      const fromRects = selectedCards.map(
        (c) => handCardRefs.current[c.id]?.getBoundingClientRect?.() ?? null
      );
      const getSlotRect = playAreaRef.current?.getSlotRect;
      const toRects = selectedCards.map((_, i) =>
        getSlotRect ? getSlotRect(publicZone.length + i) : null
      );
      const allRectsOk = fromRects.every(Boolean) && toRects.every(Boolean);

      await playToPublicZone(selectedCards);
      setSelectedCards([]);

      if (allRectsOk && fromRects.length === toRects.length) {
        setFlyingPlay(
          selectedCards.map((card, i) => ({
            card,
            fromRect: fromRects[i],
            toRect: toRects[i],
          }))
        );
        setFlyingPlayStarted(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setFlyingPlayStarted(true));
        });
      }
    } catch (err) {
      Logger.error("出牌失败:", err.message);
    }
  };

  // 开始N换N
  const handleStartForceSwap = () => {
    setSwapMode("force");
    setSelectedCards([]);
    setSelectedPublicCards([]);
  };

  // 确认N换N（先采 rect，再请求，最后设飞牌状态）
  const handleConfirmForceSwap = async () => {
    const publicZone = game?.game_state?.public_zone || [];
    const handCards = selectedCards;
    const publicCards = publicZone;
    const getSlotRect = playAreaRef.current?.getSlotRect;
    if (!getSlotRect) {
      try {
        await forceSwap(handCards);
        setSelectedCards([]);
        setSelectedPublicCards([]);
        setSwapMode(null);
        setSwapJustDone({ fromPublicToHand: publicZone.map((c) => c.id), fromHandToPublic: handCards.map((c) => c.id) });
        setTimeout(() => setSwapJustDone(null), 520);
      } catch (err) {
        Logger.error("强制交换失败:", err.message);
      }
      return;
    }
    const handFromRects = handCards.map((c) => handCardRefs.current[c.id]?.getBoundingClientRect?.() ?? null);
    const handToRects = handCards.map((_, i) => getSlotRect(i));
    const publicFromRects = publicCards.map((_, i) => getSlotRect(i));
    const allHandOk = handFromRects.every(Boolean) && handToRects.every(Boolean);
    const allPublicOk = publicFromRects.every(Boolean);
    try {
      await forceSwap(handCards);
      setSelectedCards([]);
      setSelectedPublicCards([]);
      setSwapMode(null);
      setSwapJustDone({ fromPublicToHand: publicZone.map((c) => c.id), fromHandToPublic: handCards.map((c) => c.id) });
      if (allHandOk && handCards.length === handToRects.length) {
        setFlyingHandToPublic(handCards.map((card, i) => ({ card, fromRect: handFromRects[i], toRect: handToRects[i] })));
        setFlyingHandToPublicStarted(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setFlyingHandToPublicStarted(true));
        });
      }
      if (allPublicOk && publicCards.length) {
        setFlyingPublicToHand(publicCards.map((card, i) => ({ card, fromRect: publicFromRects[i] })));
      }
    } catch (err) {
      Logger.error("强制交换失败:", err.message);
    }
  };

  // 开始M换M
  const handleStartSelectiveSwap = () => {
    setSwapMode("selective");
    setSelectedCards([]);
    setSelectedPublicCards([]);
  };

  // 确认M换M（先采 rect，再请求，最后设飞牌状态）
  const handleConfirmSelectiveSwap = async () => {
    const publicZone = game?.game_state?.public_zone || [];
    const handCards = selectedCards;
    const publicCards = selectedPublicCards;
    const getSlotRect = playAreaRef.current?.getSlotRect;
    if (!getSlotRect) {
      try {
        await selectiveSwap(handCards, publicCards);
        setSelectedCards([]);
        setSelectedPublicCards([]);
        setSwapMode(null);
        setSwapJustDone({ fromPublicToHand: publicCards.map((c) => c.id), fromHandToPublic: handCards.map((c) => c.id) });
        setTimeout(() => setSwapJustDone(null), 520);
      } catch (err) {
        Logger.error("自由交换失败:", err.message);
      }
      return;
    }
    const handFromRects = handCards.map((c) => handCardRefs.current[c.id]?.getBoundingClientRect?.() ?? null);
    const handToRectsCorrect = handCards.map((_, i) => getSlotRect(publicZone.findIndex((p) => p.id === publicCards[i].id)));
    const publicFromRects = publicCards.map((c) => getSlotRect(publicZone.findIndex((p) => p.id === c.id)));
    const allHandRectsOk = handFromRects.every(Boolean) && handToRectsCorrect.every(Boolean);
    const allPublicOk = publicFromRects.every(Boolean);
    try {
      await selectiveSwap(handCards, publicCards);
      setSelectedCards([]);
      setSelectedPublicCards([]);
      setSwapMode(null);
      setSwapJustDone({ fromPublicToHand: publicCards.map((c) => c.id), fromHandToPublic: handCards.map((c) => c.id) });
      if (allHandRectsOk && handCards.length === handToRectsCorrect.length) {
        setFlyingHandToPublic(handCards.map((card, i) => ({ card, fromRect: handFromRects[i], toRect: handToRectsCorrect[i] })));
        setFlyingHandToPublicStarted(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setFlyingHandToPublicStarted(true));
        });
      }
      if (allPublicOk && publicCards.length) {
        setFlyingPublicToHand(publicCards.map((card, i) => ({ card, fromRect: publicFromRects[i] })));
      }
    } catch (err) {
      Logger.error("自由交换失败:", err.message);
    }
  };

  // 清场
  const handleClear = async () => {
    try {
      await clearPublicZone();
    } catch (err) {
      Logger.error("清场失败:", err.message);
    }
  };

  // 清场后出牌（同出牌：手牌飞入公共区动画）
  const handlePlayAfterClear = async () => {
    if (selectedCards.length === 0) return;

    try {
      const fromRects = selectedCards.map(
        (c) => handCardRefs.current[c.id]?.getBoundingClientRect?.() ?? null
      );
      const getSlotRect = playAreaRef.current?.getSlotRect;
      const toRects = selectedCards.map((_, i) =>
        getSlotRect ? getSlotRect(i) : null
      );
      const allRectsOk = fromRects.every(Boolean) && toRects.every(Boolean);

      await playAfterClear(selectedCards);
      setSelectedCards([]);

      if (allRectsOk && fromRects.length === toRects.length) {
        setFlyingPlay(
          selectedCards.map((card, i) => ({
            card,
            fromRect: fromRects[i],
            toRect: toRects[i],
          }))
        );
        setFlyingPlayStarted(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setFlyingPlayStarted(true));
        });
      }
    } catch (err) {
      Logger.error("清场后出牌失败:", err.message);
    }
  };

  // 取消交换模式
  const handleCancelSwap = () => {
    setSwapMode(null);
    setSelectedCards([]);
    setSelectedPublicCards([]);
  };

  // 扣牌
  const handleKnock = async () => {
    try {
      await knock();
    } catch (err) {
      Logger.error("扣牌失败:", err.message);
    }
  };

  // 响应扣牌 - 随
  const handleFold = async () => {
    try {
      await respondShowdown(SHOWDOWN_ACTIONS.FOLD);
      setSelectedCards([]); // 清空选择
    } catch (err) {
      Logger.error("响应失败:", err.message);
    }
  };

  // 响应扣牌 - 砸
  const handleCall = async () => {
    try {
      await respondShowdown(SHOWDOWN_ACTIONS.CALL);
      setSelectedCards([]); // 清空选择
    } catch (err) {
      Logger.error("响应失败:", err.message);
    }
  };

  // 处理下一局
  const handleNextRound = async () => {
    try {
      Logger.game("开始下一局");
      await startNextRound();
      setSettlementData(null); // 清空结算数据
    } catch (err) {
      Logger.error("开始下一局失败:", err.message);
      alert(err.message);
    }
  };

  // 获取其他玩家（不包括当前玩家）
  const getOtherPlayers = () => {
    if (!currentPlayer) return [];

    const allPlayers = players.slice().sort((a, b) => a.position - b.position);
    const myIndex = allPlayers.findIndex((p) => p.id === currentPlayer.id);

    const others = allPlayers.filter((p) => p.id !== currentPlayer.id);

    // 根据玩家数量映射位置
    const positionMaps = {
      2: ["top"],
      3: ["top-right", "top-left"],
      4: ["right", "top", "left"],
    };

    const positions = positionMaps[players.length] || [];

    return others.map((player, index) => ({
      player,
      position: positions[index] || "top",
    }));
  };

  // 等待状态
  if (game?.status === GAME_STATUS.WAITING) {
    return (
      <WaitingRoom
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        error={error}
        loading={loading}
        roomCodeCopied={roomCodeCopied}
        isHost={isHost}
        isReady={isReady}
        canStart={canStart}
        onCopyRoomCode={handleCopyRoomCode}
        onShareLink={handleShareLink}
        onLeave={handleLeave}
        onToggleReady={handleToggleReady}
        onStartGame={handleStartGame}
      />
    );
  }

  // 游戏进行中状态（包括 showdown）
  if (
    game?.status === GAME_STATUS.PLAYING ||
    game?.status === GAME_STATUS.SHOWDOWN
  ) {
    const otherPlayers = getOtherPlayers();
    const currentTurn = game?.game_state?.current_turn || 0;
    const deckCount = game?.game_state?.deck?.length || 0;
    const publicZone = game?.game_state?.public_zone || [];
    const currentPhase = game?.game_state?.phase || "action_select";
    const roundNumber = game?.game_state?.round_number || 0;

    const currentTurnPlayer = getCurrentTurnPlayer();
    const isMyTurnNow = isMyTurn();
    // 首回合：当前局第一轮（round_number === 0）；起始玩家由 current_turn 决定，不一定是 position 0（下一局起始玩家为上局得分最低者）
    const isFirstRound = roundNumber === 0;
    const isShowdown = game?.status === GAME_STATUS.SHOWDOWN;
    const publicZoneMax = game?.hand_size ?? GAME_CONFIG.PUBLIC_ZONE_MAX;

    // 判断可用的行动（公共区容量随本局 hand_size）
    const canDrawAndPlay = publicZone.length < publicZoneMax;
    const canForceSwap =
      publicZone.length > 0 && publicZone.length < publicZoneMax;
    const canSelectiveSwap = publicZone.length === publicZoneMax;
    const canClear = publicZone.length === publicZoneMax;
    const publicEmpty = publicZone.length === 0;

    const knockStatus = checkCanKnock(
      currentPlayer?.hand || [],
      game?.game_state?.target_score || 40,
      publicZoneMax,
    );
    const showdownPlayerStatus =
      isShowdown && currentPlayer?.hand
        ? getPlayerStatus(
            currentPlayer.hand,
            game?.game_state?.target_score || 40,
            game?.hand_size ?? GAME_CONFIG.CARDS_PER_PLAYER,
          )
        : null;

    return (
      <div className="game-room-playing">
        {/* 计分板面板 - 从左侧滑出 */}
        <ScorePanel
          isOpen={scorePanelOpen}
          onClose={() => setScorePanelOpen(false)}
        />

        {/* 右上角：计分板 + 刷新 */}
        <div className="game-info-bar">
          <button
            className="btn-score-panel"
            onClick={() => setScorePanelOpen(true)}
            title="查看计分板"
            aria-label="查看计分板"
          >
            <HiOutlineChartBarSquare size={24} />
          </button>
          <div className="room-code-display">
            房间 {game?.room_code}
            {game?.status === GAME_STATUS.PLAYING && (
              <span className="round-indicator">
                第 {game.current_round}/{game.total_rounds} 局
              </span>
            )}
          </div>
          <button
            className="btn-refresh-fixed"
            onClick={refreshGameState}
            title="刷新游戏状态"
            aria-label="刷新游戏状态"
          >
            <HiOutlineArrowPath size={18} />
          </button>
        </div>

        {/* Showdown 横幅 */}
        {isShowdown && <ShowdownBanner />}

        {error && (
          <div className="error-toast">
            {error}
            <button
              className="btn-refresh-state"
              onClick={async () => {
                clearError();
                await refreshGameState();
              }}
              title="刷新游戏状态"
            >
              <HiOutlineArrowPath size={14} style={{ marginRight: "0.5vw" }} />
              刷新
            </button>
          </div>
        )}

        {otherPlayers.map(({ player, position }) => (
          <PlayerPosition
            key={player.id}
            player={player}
            position={position}
            isCurrentTurn={player.position === currentTurn}
          />
        ))}

        <PlayArea
          ref={playAreaRef}
          deckRef={deckRef}
          publicZone={publicZone}
          deckCount={deckCount}
          maxSlots={publicZoneMax}
          onPublicCardClick={
            swapMode === "selective" ? togglePublicCardSelection : null
          }
          selectedPublicCards={selectedPublicCards}
          cardsFromHandIds={swapJustDone?.fromHandToPublic ?? []}
          hiddenPublicCardIds={[
            ...(flyingPlay?.map((f) => f.card.id) ?? []),
            ...(flyingHandToPublic?.map((f) => f.card.id) ?? []),
          ]}
        />

        {/* 玩家操作日志 - 固定在左下角 */}
        <ActionLog gameId={game?.id} players={players} />

        <div className="my-hand-area">
          <div className="action-group">
            {game?.status === GAME_STATUS.SHOWDOWN ? (
              !isMyTurnToRespond() ? null : (
                <>
                  <button
                    className="btn-fold"
                    disabled={loading}
                    onClick={handleFold}
                  >
                    <span className="btn-icon">
                      <HiOutlineHandRaised size={22} />
                    </span>
                    <span className="btn-text">随（Fold）</span>
                  </button>
                  <button
                    className="btn-call"
                    disabled={loading || showdownPlayerStatus?.isMazi}
                    onClick={handleCall}
                    title={
                      showdownPlayerStatus?.isMazi ? "麻子不能砸" : "参与比牌"
                    }
                  >
                    <span className="btn-icon">
                      <HiOutlineHandThumbUp size={22} />
                    </span>
                    <span className="btn-text">砸（Call）</span>
                  </button>
                </>
              )
            ) : swapMode ? (
              /* 点击换牌后：只展示确认交换、取消 */
              <>
                <button
                  className="btn-confirm-swap"
                  disabled={
                    swapMode === "force"
                      ? selectedCards.length !== publicZone.length
                      : selectedCards.length === 0 ||
                        selectedCards.length !== selectedPublicCards.length
                  }
                  onClick={
                    swapMode === "force"
                      ? handleConfirmForceSwap
                      : handleConfirmSelectiveSwap
                  }
                >
                  确认交换
                </button>
                <button
                  className="btn-cancel-swap"
                  onClick={handleCancelSwap}
                >
                  取消
                </button>
              </>
            ) : !isMyTurnNow ? null : (isFirstRound && currentPhase === "first_play") || currentPhase === "play_after_draw" || currentPhase === "play_after_clear" ? (
              <button
                className="btn-play"
                disabled={selectedCards.length === 0}
                onClick={
                  currentPhase === "play_after_clear"
                    ? handlePlayAfterClear
                    : handlePlayCard
                }
              >
                出牌
              </button>
            ) : currentPhase === "action_select" ? (
              <>
                {!canClear && (
                  <button
                    className="btn-draw"
                    disabled={!canDrawAndPlay || loading}
                    onClick={handleDrawCard}
                    title={
                      !canDrawAndPlay
                        ? "公共区已满"
                        : loading
                          ? "请等待..."
                          : ""
                    }
                  >
                    {loading ? "摸牌中..." : "摸牌"}
                  </button>
                )}
                {!publicEmpty && (
                  <button
                    className="btn-action"
                    disabled={
                      !canForceSwap && !canSelectiveSwap
                    }
                    onClick={() =>
                      canSelectiveSwap
                        ? handleStartSelectiveSwap()
                        : handleStartForceSwap()
                    }
                    title={
                      !canForceSwap && !canSelectiveSwap
                        ? "公共区未满或数量不符合"
                        : canSelectiveSwap
                          ? "公共区满 6 张可自由换牌"
                          : "按公共区张数对等交换"
                    }
                  >
                    换牌
                  </button>
                )}
                {canClear && (
                  <button
                    className="btn-action"
                    onClick={handleClear}
                    title="清空公共区"
                  >
                    弃牌
                  </button>
                )}
                {knockStatus.canKnock && (
                  <button
                    className="btn-knock can-knock"
                    onClick={handleKnock}
                    title={knockStatus.reason}
                    aria-label={knockStatus.handScore != null ? `扣牌，当前手牌${knockStatus.handScore}分` : '扣牌'}
                  >
                    扣牌
                    {knockStatus.handScore != null && (
                      <span className="knock-hand-score">({knockStatus.handScore} 分)</span>
                    )}
                  </button>
                )}
              </>
            ) : null}
          </div>

          <div className="my-hand-cards" aria-label="手牌">
            {currentPlayer?.hand?.length > 0 ? (
              currentPlayer.hand.map((card, handIndex) => {
                const isFromSwap = swapJustDone?.fromPublicToHand?.includes(card.id);
                /* 根本性防闪：用 drawInProgress + 与上一帧 hand 的差集判定「新牌」。store 可能早于 setLastDrawnCardId 触发重渲染，仅靠 lastDrawnCardId 会有一帧新牌可见。 */
                const isNewlyDrawn =
                  drawInProgress &&
                  !previousHandRef.current.some((p) => p.id === card.id);
                const isFlyingDraw =
                  isNewlyDrawn || lastDrawnCardId === card.id;
                const isFlyingPublicToHand =
                  flyingPublicToHand?.some((f) => f.card.id === card.id);
                const wrapperClass = [
                  "hand-card-wrap",
                  isFromSwap && "card-from-public",
                  isFlyingDraw && "hand-card-flying",
                  isFlyingPublicToHand && "hand-card-flying",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div
                    key={`${card.id}-${handIndex}`}
                    className={wrapperClass}
                    ref={(el) => {
                      if (el) {
                        handCardRefs.current[card.id] = el;
                        if (lastDrawnCardId === card.id) handCardRef.current = el;
                      } else {
                        delete handCardRefs.current[card.id];
                        if (lastDrawnCardId === card.id) handCardRef.current = null;
                      }
                    }}
                  >
                    <Card
                      card={card}
                      selected={selectedCards.some((c) => c.id === card.id)}
                      onClick={(e) => handleCardClick(card, e)}
                    />
                  </div>
                );
              })
            ) : (
              <p className="no-cards-text">暂无手牌</p>
            )}
          </div>
        </div>

        {/* 摸牌：牌堆 → 手牌 飞牌层 */}
        {flyingDraw &&
          createPortal(
            <div
              className={`flying-card flying-card-draw ${flyingDrawStarted ? "flying-card-draw-active" : ""}`}
              style={{
                "--dx": `${flyingDraw.toRect.left - flyingDraw.fromRect.left}px`,
                "--dy": `${flyingDraw.toRect.top - flyingDraw.fromRect.top}px`,
                left: flyingDraw.fromRect.left,
                top: flyingDraw.fromRect.top,
                width: flyingDraw.fromRect.width,
                height: flyingDraw.fromRect.height,
              }}
              onTransitionEnd={() => {
                setFlyingDraw(null);
                setLastDrawnCardId(null);
                setFlyingDrawStarted(false);
                setDrawInProgress(false);
              }}
            >
              <Card card={flyingDraw.card} />
            </div>,
            document.body
          )}

        {/* 出牌：手牌 → 公共区 飞牌层 */}
        {flyingPlay &&
          flyingPlay.length > 0 &&
          createPortal(
            <>
              {flyingPlay.map(({ card, fromRect, toRect }, i) => (
                <div
                  key={card.id}
                  className={`flying-card flying-card-play ${flyingPlayStarted ? "flying-card-play-active" : ""}`}
                  style={{
                    "--dx": `${toRect.left - fromRect.left}px`,
                    "--dy": `${toRect.top - fromRect.top}px`,
                    left: fromRect.left,
                    top: fromRect.top,
                    width: fromRect.width,
                    height: fromRect.height,
                  }}
                  onTransitionEnd={() => {
                    if (i === flyingPlay.length - 1) {
                      setFlyingPlay(null);
                      setFlyingPlayStarted(false);
                    }
                  }}
                >
                  <Card card={card} />
                </div>
              ))}
            </>,
            document.body
          )}

        {/* 换牌：手牌 → 公共区 飞牌层 */}
        {flyingHandToPublic &&
          flyingHandToPublic.length > 0 &&
          createPortal(
            <>
              {flyingHandToPublic.map(({ card, fromRect, toRect }, i) => (
                <div
                  key={`htp-${card.id}`}
                  className={`flying-card flying-card-play ${flyingHandToPublicStarted ? "flying-card-play-active" : ""}`}
                  style={{
                    "--dx": `${toRect.left - fromRect.left}px`,
                    "--dy": `${toRect.top - fromRect.top}px`,
                    left: fromRect.left,
                    top: fromRect.top,
                    width: fromRect.width,
                    height: fromRect.height,
                  }}
                  onTransitionEnd={() => {
                    if (i === flyingHandToPublic.length - 1) {
                      setFlyingHandToPublic(null);
                      setFlyingHandToPublicStarted(false);
                      if (!flyingPublicToHand?.length) setSwapJustDone(null);
                    }
                  }}
                >
                  <Card card={card} />
                </div>
              ))}
            </>,
            document.body
          )}

        {/* 换牌：公共区 → 手牌 飞牌层（toRect 在 effect 中测量后才有位移动画） */}
        {flyingPublicToHand &&
          flyingPublicToHand.length > 0 &&
          createPortal(
            <>
              {flyingPublicToHand.map((item, i) => {
                const { card, fromRect, toRect } = item;
                const hasToRect = toRect != null;
                return (
                  <div
                    key={`pth-${card.id}`}
                    className={`flying-card flying-card-play ${hasToRect && flyingPublicToHandStarted ? "flying-card-play-active" : ""}`}
                    style={{
                      "--dx": hasToRect ? `${toRect.left - fromRect.left}px` : "0px",
                      "--dy": hasToRect ? `${toRect.top - fromRect.top}px` : "0px",
                      left: fromRect.left,
                      top: fromRect.top,
                      width: fromRect.width,
                      height: fromRect.height,
                    }}
                    onTransitionEnd={() => {
                      if (i === flyingPublicToHand.length - 1) {
                        setFlyingPublicToHand(null);
                        setFlyingPublicToHandStarted(false);
                        if (!flyingHandToPublic?.length) setSwapJustDone(null);
                      }
                    }}
                  >
                    <Card card={card} />
                  </div>
                );
              })}
            </>,
            document.body
          )}

        <div className="game-background">
          <div className="pattern pattern-1"></div>
          <div className="pattern pattern-2"></div>
        </div>
      </div>
    );
  }

  // 结算界面
  if (game?.status === GAME_STATUS.FINISHED && settlementData) {
    return (
      <div className="game-room-playing">
        {/* 计分板面板 - 从左侧滑出 */}
        <ScorePanel
          isOpen={scorePanelOpen}
          onClose={() => setScorePanelOpen(false)}
        />

        {/* 右上角：计分板 + 刷新 */}
        <div className="game-info-bar">
          <button
            className="btn-score-panel"
            onClick={() => setScorePanelOpen(true)}
            title="查看计分板"
            aria-label="查看计分板"
          >
            <HiOutlineChartBarSquare size={24} />
          </button>
          <div className="room-code-display">
            房间 {game?.room_code}
            {game?.status === GAME_STATUS.PLAYING && (
              <span className="round-indicator">
                第 {game.current_round}/{game.total_rounds} 局
              </span>
            )}
          </div>
          <button
            className="btn-refresh-fixed"
            onClick={refreshGameState}
            title="刷新游戏状态"
            aria-label="刷新游戏状态"
          >
            <HiOutlineArrowPath size={18} />
          </button>
        </div>

        <SettlementModal
          players={players}
          responses={game.game_state.showdown_responses}
          winnerId={settlementData.winnerId}
          scores={settlementData.scores}
          onNextRound={handleNextRound}
        />

        <div className="game-background">
          <div className="pattern pattern-1"></div>
          <div className="pattern pattern-2"></div>
        </div>
      </div>
    );
  }

  return null;
}
