import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[lib/supabase.js] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY not set in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

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

  const latestByPool = new Map();
  for (const row of data) {
    const key = `${row.strategy_type}_${row.sensitivity}`;
    if (!latestByPool.has(key)) {
      latestByPool.set(key, row);
    }
  }
  return Array.from(latestByPool.values());
}

export async function getAllSubPoolsPortfolioHistory(limit = 300) {
  const { data, error } = await supabase
    .from('sol_signals')
    .select('date, strategy_type, sensitivity, portfolio, created_at')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('getAllSubPoolsPortfolioHistory error:', error);
    return {};
  }

  const grouped = {};
  for (const row of data) {
    if (row.portfolio === null || row.portfolio === undefined) continue;
    const key = `${row.strategy_type}_${row.sensitivity}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ date: row.date, portfolio: row.portfolio });
  }
  return grouped;
}

export async function requestBotRun(strategyType, sensitivity) {
  const { data, error } = await supabase
    .from('bot_run_requests')
    .insert({ strategy_type: strategyType, sensitivity, status: 'pending' })
    .select()
    .single();

  if (error) {
    console.error('requestBotRun error:', error);
    throw error;
  }
  return data;
}

export async function getRecentBotRunRequests(limit = 10) {
  const { data, error } = await supabase
    .from('bot_run_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getRecentBotRunRequests error:', error);
    return [];
  }
  return data;
}

export async function getSignalHistory(strategyType, sensitivity, limit = 60) {
  const { data, error } = await supabase
    .from('sol_signals')
    .select('date, buy_prob, hold_prob, sell_prob, signal, price, rsi, confidence')
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

export async function getTradesForPool(strategyType, sensitivity, limit = 20) {
  const { data, error } = await supabase
    .from('sol_trades')
    .select('*')
    .eq('strategy_type', strategyType)
    .eq('sensitivity', sensitivity)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getTradesForPool error:', error);
    return [];
  }
  return data;
}

export async function getMarketHistory(limit = 2500) {
  const { data, error } = await supabase
    .from('market_history')
    .select('date, price, vix, dxy')
    .order('date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('getMarketHistory error:', error);
    return [];
  }
  return data;
}
