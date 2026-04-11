import React, { useState } from 'react'

export default function ChatInput({ onSendMessage, disabled, placeholder }) {
  const [text, setText] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!text.trim() || disabled) return
    onSendMessage(text.trim())
    setText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form className="message-box" onSubmit={handleSubmit}>
      <textarea
        className="message-input"
        placeholder={placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button 
        type="submit" 
        className="message-submit" 
        disabled={disabled || !text.trim()}
      >
        Send
      </button>
    </form>
  )
}
