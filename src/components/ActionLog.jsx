import { useEffect, useState, useRef } from 'react'
import { supabase } from '../config/supabase'
import Card from './Card'
import './ActionLog.css'

const MAX_ENTRIES = 50
const POLL_INTERVAL_MS = 2500

/**
 * 返回 { name, actionParts }，actionParts 仅含操作描述（不含用户名）
 */
function buildActionEntry(actionType, actionData, playerNickname) {
  const name = playerNickname ?? '某玩家'
  const actionParts = []

  switch (actionType) {
    case 'draw_card':
      return null
    case 'play_to_public': {
      const cards = actionData?.cards || []
      actionParts.push({ type: 'text', value: '出牌 ' })
      if (cards.length > 0) actionParts.push({ type: 'cards', cards })
      break
    }
    case 'play_after_clear': {
      const cards = actionData?.cards || []
      actionParts.push({ type: 'text', value: '出牌 ' })
      if (cards.length > 0) actionParts.push({ type: 'cards', cards })
      break
    }
    case 'force_swap': {
      const handOut = actionData?.hand_cards_out || []
      const publicIn = actionData?.public_cards_in || []
      const n = handOut.length
      if (n === 1 && handOut[0] && publicIn[0]) {
        actionParts.push({ type: 'text', value: '换牌，用 ' })
        actionParts.push({ type: 'cards', cards: handOut })
        actionParts.push({ type: 'text', value: ' 换 ' })
        actionParts.push({ type: 'cards', cards: publicIn })
      } else if (n > 1) {
        actionParts.push({ type: 'text', value: `${n}换${n}，用手牌 ` })
        actionParts.push({ type: 'cards', cards: handOut })
        actionParts.push({ type: 'text', value: ' 换公共区 ' })
        actionParts.push({ type: 'cards', cards: publicIn })
      } else {
        actionParts.push({ type: 'text', value: '进行了N换N' })
      }
      break
    }
    case 'selective_swap': {
      const handOut = actionData?.hand_cards_out || []
      const publicOut = actionData?.public_cards_out || []
      if (handOut.length === 1 && publicOut.length === 1) {
        actionParts.push({ type: 'text', value: '换牌，用 ' })
        actionParts.push({ type: 'cards', cards: handOut })
        actionParts.push({ type: 'text', value: ' 换 ' })
        actionParts.push({ type: 'cards', cards: publicOut })
      } else if (handOut.length > 1) {
        actionParts.push({ type: 'text', value: '自由换牌，用 ' })
        actionParts.push({ type: 'cards', cards: handOut })
        actionParts.push({ type: 'text', value: ' 换 ' })
        actionParts.push({ type: 'cards', cards: publicOut })
      } else {
        actionParts.push({ type: 'text', value: '自由换牌' })
      }
      break
    }
    case 'clear_zone': {
      const clearedCards = actionData?.cleared_cards || []
      actionParts.push({ type: 'text', value: '弃牌' })
      if (clearedCards.length > 0) {
        actionParts.push({ type: 'text', value: ' ' })
        actionParts.push({ type: 'cards', cards: clearedCards })
      }
      break
    }
    case 'knock':
      actionParts.push({ type: 'text', value: '扣牌' })
      break
    case 'fold':
      actionParts.push({ type: 'text', value: '随' })
      break
    case 'call':
      actionParts.push({ type: 'text', value: '砸' })
      break
    case 'settlement':
      actionParts.push({ type: 'text', value: '本局结算' })
      break
    default:
      actionParts.push({ type: 'text', value: '进行了操作' })
  }

  return { name, actionParts }
}

export default function ActionLog({ gameId, players = [] }) {
  const [entries, setEntries] = useState([])
  const listRef = useRef(null)
  const playersById = useRef({})

  useEffect(() => {
    playersById.current = players.reduce((acc, p) => {
      acc[p.id] = p.nickname || p.id
      return acc
    }, {})
  }, [players])

  useEffect(() => {
    if (!gameId) return

    const fetchActions = async () => {
      const { data, error } = await supabase
        .from('game_actions')
        .select('id, player_id, action_type, action_data, created_at')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true })
        .limit(MAX_ENTRIES)

      if (error) return

      const nicknames = playersById.current
      const list = (data || [])
        .map((row) => {
          const nickname = row.player_id ? nicknames[row.player_id] : null
          const built = buildActionEntry(row.action_type, row.action_data || {}, nickname)
          if (built === null) return null
          return { id: row.id, name: built.name, actionParts: built.actionParts, createdAt: row.created_at }
        })
        .filter(Boolean)

      setEntries(list)
    }

    fetchActions()
    const interval = setInterval(fetchActions, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [gameId])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries])

  return (
    <div className="action-log">
      <div className="action-log-list" ref={listRef}>
        {entries.length === 0 ? (
          <div className="action-log-empty">暂无操作</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="action-log-row">
              <span className="action-log-name">{entry.name || '—'}</span>
              <div className="action-log-action">
                {entry.actionParts.map((part, idx) =>
                  part.type === 'text' ? (
                    <span key={idx}>{part.value}</span>
                  ) : (
                    <span key={idx} className="action-log-cards">
                      {part.cards.map((card, i) => (
                        <Card key={`${card.id}-${i}`} card={card} micro />
                      ))}
                    </span>
                  )
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
