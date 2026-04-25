import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { MessageCircle } from 'lucide-react'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import '../chat.css'

export default function RideChat({ rideId, currentUserId, driverUserId, canChat, isCompleted }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (!rideId || !canChat) {
      setLoading(false)
      return
    }

    fetchMessages()

    const chatSub = supabase.channel(`public:chat_messages:ride_id=eq.${rideId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `ride_id=eq.${rideId}` }, (payload) => {
        // We fetch the full message with user data instead of appending directly to ensure we have the names
        fetchSingleMessage(payload.new.id)
      })
      .subscribe()

    return () => {
      chatSub.unsubscribe()
    }
  }, [rideId, canChat])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchMessages = async () => {
    setLoading(true)
    const { data: msgData, error } = await supabase
      .from('chat_messages')
      .select(`*, users!sender_id(name, avatar_url)`)
      .eq('ride_id', rideId)
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (!error && msgData) {
      // Revert order for rendering (oldest first)
      setMessages(msgData.reverse())
    }
    setLoading(false)
  }

  const fetchSingleMessage = async (messageId) => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(`*, users!sender_id(name, avatar_url)`)
      .eq('id', messageId)
      .single()
    
    if (!error && data) {
      setMessages(prev => [...prev, data])
    }
  }

  const handleSendMessage = async (text) => {
    const { error } = await supabase.from('chat_messages').insert([
      { ride_id: rideId, sender_id: currentUserId, content: text }
    ])
    if (error) console.error("Error sending message:", error)
  }

  let placeholder = "Type a message..."
  if (!canChat) placeholder = "Chat hidden"
  if (isCompleted) placeholder = "Chat closed"

  return (
    <div className="chat-container">
      
      <div className="chat-title">
        <h1>Ride Chat</h1>
        <h2>Coordination</h2>
        <figure className="avatar">
          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Ride${rideId}`} alt="Avatar" />
        </figure>
      </div>
      
      <div className="messages">
        <div className="messages-content">
          {!canChat ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <MessageCircle size={32} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <div>Chat is only available for approved<br/>passengers and the ride creator.</div>
            </div>
          ) : loading ? (
            <div className="message loading new">
              <figure className="avatar">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Loading`} alt="Loading" />
              </figure>
              <span></span>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: '2rem' }}>Say hello! Start coordinating your ride.</div>
          ) : (
            messages.map(msg => (
              <ChatMessage 
                key={msg.id} 
                message={msg} 
                isMe={msg.sender_id === currentUserId} 
                isDriver={msg.sender_id === driverUserId && msg.sender_id !== null}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput 
        onSendMessage={handleSendMessage} 
        disabled={!canChat || isCompleted} 
        placeholder={placeholder}
      />
      
    </div>
  )
}
