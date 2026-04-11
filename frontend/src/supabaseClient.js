import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dgpomagzcbzgalyydaom.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRncG9tYWd6Y2J6Z2FseXlkYW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4OTg0NjMsImV4cCI6MjA4ODQ3NDQ2M30.C-eF-FncCSI7IvEPjacw1_VmAdlT5q-nCHFFVGuneGE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
