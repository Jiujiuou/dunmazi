import { useState } from 'react'
import { HiOutlineChatBubbleBottomCenterText, HiOutlinePaperAirplane, HiXMark } from 'react-icons/hi2'
import './ChatStrip.css'

/**
 * 发言区：操作区上方可折叠条，输入框 + 发送 + 最近消息（预留，暂无后端）
 * 文档: docs/UI-Layout-Analysis.md 4.3
 */
export default function ChatStrip() {
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [messages] = useState([]) // 预留：后续接 Supabase 或 store

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    // TODO: 发送消息到后端
    setInput('')
  }

  return (
    <div className={`chat-strip ${expanded ? 'expanded' : ''}`} aria-label="发言区">
      {expanded ? (
        <div className="chat-strip-inner">
          <div className="chat-strip-messages">
            {messages.length === 0 ? (
              <span className="chat-strip-placeholder">暂无消息</span>
            ) : (
              messages.map((m, i) => (
                <span key={i} className="chat-strip-msg">{m.name}: {m.text}</span>
              ))
            )}
          </div>
          <form className="chat-strip-form" onSubmit={handleSubmit}>
            <input
              type="text"
              className="chat-strip-input"
              placeholder="输入发言..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={80}
              aria-label="发言输入"
            />
            <button type="submit" className="chat-strip-send" title="发送" aria-label="发送">
              <HiOutlinePaperAirplane size={18} />
            </button>
          </form>
          <button
            type="button"
            className="chat-strip-close"
            onClick={() => setExpanded(false)}
            title="收起发言区"
            aria-label="收起发言区"
          >
            <HiXMark size={18} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="chat-strip-toggle"
          onClick={() => setExpanded(true)}
          title="发言"
          aria-label="展开发言区"
        >
          <HiOutlineChatBubbleBottomCenterText size={20} />
          <span>发言</span>
        </button>
      )}
    </div>
  )
}
