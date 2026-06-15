import { supabase } from '../supabase'

// ==================== PET PROFILE FUNCTIONS ====================

/**
 * Fetch the pet profile for a given user.
 *
 * @param {string} userId  - The auth user's UUID.
 * @returns {{ data: object|null, error: object|null }}
 */
export const getPetProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('pet_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    // PGRST116 = no rows found; treat as null data, not an error
    if (error && error.code !== 'PGRST116') throw error

    return { data: data || null, error: null }
  } catch (error) {
    console.error('[getPetProfile]', error)
    return { data: null, error }
  }
}

/**
 * Create a new pet profile for a given user.
 *
 * @param {string} userId     - The auth user's UUID.
 * @param {object} profileData - Fields to insert (e.g. name, species, breed, dob).
 * @returns {{ data: object|null, error: object|null }}
 */
export const createPetProfile = async (userId, profileData = {}) => {
  try {
    const { data, error } = await supabase
      .from('pet_profiles')
      .insert([{
        user_id: userId,
        ...profileData,
        created_at: new Date().toISOString(),
      }])
      .select()
      .single()

    if (error) throw error

    return { data: data || null, error: null }
  } catch (error) {
    console.error('[createPetProfile]', error)
    return { data: null, error }
  }
}

/**
 * Update an existing pet profile for a given user.
 *
 * @param {string} userId  - The auth user's UUID.
 * @param {object} updates - Columns to update (e.g. { name: 'Buddy', breed: 'Labrador' }).
 * @returns {{ data: object|null, error: object|null }}
 */
export const updatePetProfile = async (userId, updates = {}) => {
  try {
    const { data, error } = await supabase
      .from('pet_profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error

    return { data: data || null, error: null }
  } catch (error) {
    console.error('[updatePetProfile]', error)
    return { data: null, error }
  }
}
