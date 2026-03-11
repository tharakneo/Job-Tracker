import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://eidlattoxpvyobbhetch.supabase.co'
const supabaseKey = 'sb_publishable_dXBzGULEfcbKWWoWHcdXLQ_TfXuTzQ4'

// In a real production app, you would use import.meta.env.VITE_SUPABASE_URL 
// but since this is a local/personal tool, hardcoding here is fine for now!
export const supabase = createClient(supabaseUrl, supabaseKey)
