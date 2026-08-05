import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[lib/supabase.js] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY не задані в .env.local'
  );
}

// ВАЖЛИВО: тут використовується PUBLISHABLE key (публічний, безпечний
// для фронтенду), НЕ SECRET key — той лишається виключно на боті/сервері.
export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Останній сигнал по кожному з 6 sub-pools (strategy_type × sensitivity).
 */
export async function getLatestSignals() {
  const { data, error } = await supabase
    .from('sol_signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('getLatestSignals error:', error);
    return [];
  }

  // Останній запис на кожну унікальну комбінацію strategy_type+sensitivity
  const latestByPool = new Map();
  for (const row of data) {
    const key = `${row.strategy_type}_${row.sensitivity}`;
    if (!latestByPool.has(key)) {
      latestByPool.set(key, row);
    }
  }
  return Array.from(latestByPool.values());
}

/**
 * Історія NAV конкретного sub-pool за N останніх днів — для графіка.
 */
export async function getNavHistory(strategyType, sensitivity, days = 90) {
  const { data, error } = await supabase
    .from('fund_nav_history')
    .select('date, nav_per_share, total_capital_usdc')
    .eq('strategy_type', strategyType)
    .eq('sensitivity', sensitivity)
    .order('date', { ascending: true })
    .limit(days);

  if (error) {
    console.error('getNavHistory error:', error);
    return [];
  }
  return data;
}

/**
 * Історія target_position (regression-сигнал, збережений у полі
 * buy_prob — див. push_to_supabase у craft_sol_bot.py) для одного
 * sub-pool — джерело даних для waveform-візуалізації на дашборді.
 */
export async function getSignalHistory(strategyType, sensitivity, limit = 60) {
  const { data, error } = await supabase
    .from('sol_signals')
    .select('date, buy_prob, signal, price')
    .eq('strategy_type', strategyType)
    .eq('sensitivity', sensitivity)
    .order('date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('getSignalHistory error:', error);
    return [];
  }
  return data;
}

/**
 * Останні угоди по всіх sub-pools.
 */
export async function getRecentTrades(limit = 20) {
  const { data, error } = await supabase
    .from('sol_trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getRecentTrades error:', error);
    return [];
  }
  return data;
}
