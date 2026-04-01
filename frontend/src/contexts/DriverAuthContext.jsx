import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const DriverAuthContext = createContext({})

export const DriverAuthProvider = ({ children }) => {
  const [driver, setDriver] = useState(null)
  const [driverLoading, setDriverLoading] = useState(true)

  const fetchDriverProfile = async (userId) => {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.warn('Could not fetch driver profile:', error)
      return null
    }
    return data
  }

  const handleSession = async (session) => {
    if (session?.user) {
      const profile = await fetchDriverProfile(session.user.id)
      if (profile) {
        setDriver({ ...session.user, ...profile })
      } else {
        // Auth user exists but no driver profile yet (first login)
        setDriver({ ...session.user, profilePending: true })
      }
    } else {
      setDriver(null)
    }
    setDriverLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleSession(session)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  const signInWithPhone = async (phone) => {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (error) throw error
  }

  const verifyOtp = async (phone, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    })
    if (error) throw error
    return data
  }

  const createProfile = async (profileData) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('drivers')
      .insert([{ id: user.id, ...profileData, status: 'available' }])
      .select()
      .single()

    if (error) throw error
    setDriver({ ...user, ...data })
    return data
  }

  const refreshProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const profile = await fetchDriverProfile(user.id)
    if (profile) setDriver({ ...user, ...profile })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setDriver(null)
  }

  return (
    <DriverAuthContext.Provider
      value={{ driver, driverLoading, signInWithPhone, verifyOtp, createProfile, refreshProfile, signOut }}
    >
      {children}
    </DriverAuthContext.Provider>
  )
}

export const useDriverAuth = () => useContext(DriverAuthContext)
