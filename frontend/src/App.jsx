import React from 'react'
import { Routes, Route, Navigate, BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Navbar from './components/Navbar'

// Pages
import LoginSelector from './pages/LoginSelector'
import Login from './pages/Login'
import DriverLogin from './pages/DriverLogin'
import Rides from './pages/Rides'
import CreateRide from './pages/CreateRide'
import RideDetails from './pages/RideDetails'
import ProfilePage from './pages/ProfilePage'
import ProfilePublic from './pages/ProfilePublic'
import PendingReviews from './pages/PendingReviews'
import RideHistory from './pages/RideHistory'
import AdminDrivers from './pages/AdminDrivers'
import DriverDashboardPage from './pages/DriverDashboardPage'

// Protected route for students only
const StudentRoute = ({ children }) => {
  const { user, role } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (role === 'driver') return <Navigate to="/driver-dashboard" replace />
  return children
}

// Protected route for drivers only
const DriverRoute = ({ children }) => {
  const { user, role } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (role === 'student') return <Navigate to="/" replace />
  return children
}

// Generic protected route (any authenticated user)
const ProtectedRoute = ({ children }) => {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Admin route strictly for the listed email
const AdminRoute = ({ children }) => {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.email !== '2023aib1015@iitrpr.ac.in') return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user, role } = useAuth()

  return (
    <div className="app-container">
      {user && <Navbar />}
      <Routes>
        {/* Auth routes — redirect if already logged in */}
        <Route
          path="/login"
          element={
            !user ? <LoginSelector /> :
            role === 'driver' ? <Navigate to="/driver-dashboard" replace /> :
            <Navigate to="/" replace />
          }
        />
        <Route
          path="/login/student"
          element={!user ? <Login /> : <Navigate to="/" replace />}
        />
        <Route
          path="/login/driver"
          element={!user ? <DriverLogin /> : <Navigate to="/driver-dashboard" replace />}
        />

        {/* Student routes */}
        <Route path="/" element={<StudentRoute><Rides /></StudentRoute>} />
        <Route path="/create" element={<StudentRoute><CreateRide /></StudentRoute>} />
        <Route path="/ride/:id" element={<ProtectedRoute><RideDetails /></ProtectedRoute>} />
        <Route path="/pending-reviews" element={<StudentRoute><PendingReviews /></StudentRoute>} />
        <Route path="/history" element={<StudentRoute><RideHistory /></StudentRoute>} />
        <Route path="/profile/settings" element={<StudentRoute><ProfilePage /></StudentRoute>} />
        <Route path="/profile/:id" element={<ProtectedRoute><ProfilePublic /></ProtectedRoute>} />
        <Route path="/admin/drivers" element={<AdminRoute><AdminDrivers /></AdminRoute>} />

        {/* Driver routes */}
        <Route path="/driver-dashboard" element={<DriverRoute><DriverDashboardPage /></DriverRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
