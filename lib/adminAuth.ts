import { supabase } from './supabaseClient';

const AUTH_KEY = 'safestack_admin_authenticated';
const AUTH_TIMESTAMP_KEY = 'safestack_admin_auth_time';

export function isAdminAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  const isAuth = localStorage.getItem(AUTH_KEY) === 'true';
  const authTime = localStorage.getItem(AUTH_TIMESTAMP_KEY);

  // Auto-expire session after 12 hours for security
  if (isAuth && authTime) {
    const elapsedHours = (Date.now() - parseInt(authTime, 10)) / (1000 * 60 * 60);
    if (elapsedHours > 12) {
      logoutAdmin();
      return false;
    }
  }
  return isAuth;
}

/**
 * Verifies admin passcode against Supabase `warehouse_admin_settings` database table.
 * Prevents client-side hardcoded passcode reverse engineering.
 */
export async function verifyAdminPasscodeWithSupabase(inputPasscode: string): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmedInput = inputPasscode.trim();
    if (!trimmedInput) {
      return { success: false, error: 'Passcode cannot be empty.' };
    }

    // Query Supabase warehouse_admin_settings table
    const { data, error } = await supabase
      .from('warehouse_admin_settings')
      .select('passcode')
      .eq('id', 'default')
      .maybeSingle();

    if (error) {
      console.error('Supabase warehouse_admin_settings fetch error:', error);
      return { success: false, error: 'Connection failed. Please check your network.' };
    }

    let dbPasscode = data?.passcode;

    // Fallback: If table is empty, auto-initialize with 'admin'
    if (!dbPasscode) {
      dbPasscode = 'admin';
      await supabase.from('warehouse_admin_settings').upsert({ id: 'default', passcode: 'admin' });
    }

    // Verify passcode against Supabase record
    if (trimmedInput === dbPasscode) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(AUTH_KEY, 'true');
        localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());
        window.dispatchEvent(new Event('safestack_auth_change'));
      }
      return { success: true };
    }

    return { success: false, error: 'Invalid security passcode.' };
  } catch (err: any) {
    console.error('Passcode verification error:', err);
    return { success: false, error: 'Verification failed. Please try again.' };
  }
}

/**
 * Updates the admin passcode in Supabase warehouse_admin_settings table.
 */
export async function updateAdminPasscodeInSupabase(newPasscode: string): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmed = newPasscode.trim();
    if (trimmed.length < 4) {
      return { success: false, error: 'New passcode must be at least 4 characters.' };
    }

    const { error } = await supabase
      .from('warehouse_admin_settings')
      .upsert({ id: 'default', passcode: trimmed, updated_at: new Date().toISOString() });

    if (error) {
      console.error('Passcode update error:', error);
      return { success: false, error: 'Failed to update passcode. Please try again.' };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Passcode update error:', err);
    return { success: false, error: 'Failed to update passcode. Please try again.' };
  }
}

export function logoutAdmin(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_TIMESTAMP_KEY);
  window.dispatchEvent(new Event('safestack_auth_change'));
}
