import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Helpers key-value (imitan window.storage de Claude) ───────────────────
export const sGet = async key => {
  try {
    const { data, error } = await supabase
      .from('storage')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    if (error) throw error
    return data ? data.value : null
  } catch (e) {
    console.warn('sGet error:', e)
    return null
  }
}

export const sSet = async (key, value) => {
  try {
    const { error } = await supabase
      .from('storage')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw error
  } catch (e) {
    console.warn('sSet error:', e)
  }
}
