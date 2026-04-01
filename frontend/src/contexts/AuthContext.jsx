import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)  // 'student' | 'driver' | null
  const [loading, setLoading] = useState(true)

  const handleSession = async (session) => {
    if (session?.user) {
      const authUser = session.user

      // Check if this is a driver (phone login, exists in drivers table)
      if (authUser.phone && !authUser.email) {
        let { data: driverProfile } = await supabase
          .from('drivers')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle()

        // Fetch their legacy admin info to fallback any blank fields
        const raw = authUser.phone.replace(/\\D/g, '')
        const noCode = raw.startsWith('91') ? raw.slice(2) : raw
        const { data: legacy } = await supabase
          .from('registered_vehicles')
          .select('*')
          .in('mobile_number', [`+91${noCode}`, noCode, authUser.phone])
          .maybeSingle()

        if (!driverProfile && legacy) {
          // Auto-provision their drivers record if they somehow bypassed the Setup step
          const newDriver = {
            id: authUser.id,
            name: legacy.name?.trim() || 'Driver',
            mobile_number: authUser.phone,
            vehicle_number: legacy.vehicle_number,
            vehicle_type: legacy.vehicle_type,
            status: 'available'
          }
          await supabase.from('drivers').insert([newDriver])
          driverProfile = newDriver
        }

        if (driverProfile) {
          // Merge legacy fallback data if their auth profile is missing names
          const mergedProfile = { ...driverProfile }
          if (legacy) {
            mergedProfile.name = mergedProfile.name?.trim() || legacy.name
            mergedProfile.vehicle_number = mergedProfile.vehicle_number?.trim() || legacy.vehicle_number
            mergedProfile.vehicle_type = mergedProfile.vehicle_type?.trim() || legacy.vehicle_type
          }

          setUser({ ...authUser, ...mergedProfile })
          setRole('driver')
          setLoading(false)
          return
        } else {
          // Phone user but no driver profile yet
          setUser({ ...authUser, profilePending: true })
          setRole('driver')
          setLoading(false)
          return
        }
      }

      // Student path — must be @iitrpr.ac.in
      if (authUser.email) {
        if (!authUser.email.endsWith('@iitrpr.ac.in')) {
          await supabase.auth.signOut()
          alert('Access Restricted: Only @iitrpr.ac.in campus emails are allowed.')
          setUser(null)
          setRole(null)
          setLoading(false)
          return
        }

        const { data: profile, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle()

        if (error) {
          console.warn('Could not fetch user profile:', error)
          setUser(authUser)
        } else {
          setUser({ ...authUser, ...profile })
        }
        setRole('student')
        setLoading(false)
        return
      }

      // Fallback: check which table the user belongs to
      const { data: driverCheck } = await supabase
        .from('drivers')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle()

      if (driverCheck) {
        setRole('driver')
        setUser({ ...authUser })
      } else {
        setRole('student')
        setUser({ ...authUser })
      }
    } else {
      setUser(null)
      setRole(null)
    }
    setLoading(false)
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

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  return useContext(AuthContext)
}
