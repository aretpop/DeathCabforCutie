import React from 'react'

export default function ChatMessage({ message, isMe }) {
  if (!message) return null

  const formattedTime = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`message ${isMe ? 'message-personal' : ''} new`}>
      {!isMe && (
        <figure className="avatar">
          <img src={message.users?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (message.users?.name || 'User')} alt="Avatar" />
        </figure>
      )}
      {message.content}
      <div className="timestamp">{formattedTime}</div>
    </div>
  )
}
