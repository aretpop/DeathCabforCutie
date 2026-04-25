import React from 'react'

export default function ChatMessage({ message, isMe, isDriver }) {
  if (!message) return null

  const formattedTime = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const isSystem = message.message_type === 'system'

  if (isSystem) {
    return (
      <div className={`message message-system new`}>
        {message.content}
        <div className="timestamp" style={{ bottom: '-15px', width: '100%', textAlign: 'center', right: 'auto' }}>{formattedTime}</div>
      </div>
    )
  }

  return (
    <div className={`message ${isMe ? 'message-personal' : ''} new`}>
      {!isMe && (
        <figure className="avatar">
          <img src={message.users?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (message.users?.name || 'User')} alt="Avatar" />
        </figure>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {!isMe && (
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {message.users?.name || 'User'}
            {isDriver && <span style={{ background: 'var(--primary)', color: 'white', padding: '1px 5px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 'bold', lineHeight: 1 }}>DRIVER</span>}
          </div>
        )}
        {message.content}
      </div>
      <div className="timestamp">{formattedTime}</div>
    </div>
  )
}
