import React from 'react'
import { Routes, Route, Navigate, BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Navbar from './components/Navbar'

// Pages
import Login from './pages/Login'
import Rides from './pages/Rides'
import CreateRide from './pages/CreateRide'
import RideDetails from './pages/RideDetails'
import ProfilePage from './pages/ProfilePage'
import ProfilePublic from './pages/ProfilePublic'
import PendingReviews from './pages/PendingReviews'
import AdminDrivers from './pages/AdminDrivers'

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth()
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <div className="app-container">
      {user && <Navbar />}
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
        <Route path="/" element={<ProtectedRoute><Rides /></ProtectedRoute>} />
        <Route path="/create" element={<ProtectedRoute><CreateRide /></ProtectedRoute>} />
        <Route path="/ride/:id" element={<ProtectedRoute><RideDetails /></ProtectedRoute>} />
        <Route path="/pending-reviews" element={<ProtectedRoute><PendingReviews /></ProtectedRoute>} />
        <Route path="/profile/settings" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/profile/:id" element={<ProtectedRoute><ProfilePublic /></ProtectedRoute>} />
        <Route path="/admin/drivers" element={<ProtectedRoute><AdminDrivers /></ProtectedRoute>} />
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
