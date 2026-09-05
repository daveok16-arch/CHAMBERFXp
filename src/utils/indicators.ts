// Pure technical-analysis math (extracted from server.ts).
// Pure TS replication of the Python indicator functions.
// -----------------------------------------------------------------------------
export function computeRsiArray(prices: number[], period: number): number[] {
  const rsi: number[] = new Array(prices.length).fill(50);
  if (prices.length < period) return rsi;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  
  return rsi;
}

export function computeMacdArray(prices: number[], fast: number, slow: number, signal: number) {
  const macdLine: number[] = new Array(prices.length).fill(0);
  const signalLine: number[] = new Array(prices.length).fill(0);
  const macdHists: number[] = new Array(prices.length).fill(0);
  
  const emaFast = computeEmaArray(prices, fast);
  const emaSlow = computeEmaArray(prices, slow);
  
  for (let i = 0; i < prices.length; i++) {
    macdLine[i] = emaFast[i] - emaSlow[i];
  }
  
  const sigEma = computeEmaArray(macdLine, signal);
  for (let i = 0; i < prices.length; i++) {
    signalLine[i] = sigEma[i];
    macdHists[i] = macdLine[i] - signalLine[i];
  }
  
  return { macdLine, signalLine, macdHists };
}

export function computeEmaArray(prices: number[], span: number): number[] {
  const ema: number[] = new Array(prices.length).fill(0);
  if (prices.length === 0) return ema;
  
  const mult = 2 / (span + 1);
  ema[0] = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema[i] = (prices[i] - ema[i - 1]) * mult + ema[i - 1];
  }
  return ema;
}

export function computeBollingerBandsWidthArray(prices: number[], period: number, k: number): number[] {
  const bbWidth: number[] = new Array(prices.length).fill(0);
  if (prices.length < period) return bbWidth;
  
  for (let i = period - 1; i < prices.length; i++) {
    const window = prices.slice(i - period + 1, i + 1);
    const mean = window.reduce((acc, v) => acc + v, 0) / period;
    const variance = window.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);
    
    // Width = 2 * K * SD / Middle Band (Mean)
    bbWidth[i] = mean === 0 ? 0 : (2 * k * sd) / mean;
  }
  
  return bbWidth;
}

export function computeAtrArray(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const atr: number[] = new Array(closes.length).fill(0);
  if (closes.length === 0) return atr;
  
  const tr: number[] = [];
  tr.push(highs[0] - lows[0]);
  
  for (let i = 1; i < closes.length; i++) {
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(tr1, tr2, tr3));
  }
  
  return computeEmaArray(tr, period);
}

export function computeAdxArray(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const adx: number[] = new Array(closes.length).fill(0);
  if (closes.length < period) return adx;
  
  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  
  tr.push(highs[0] - lows[0]);
  plusDm.push(0);
  minusDm.push(0);
  
  for (let i = 1; i < closes.length; i++) {
    const trVal = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    tr.push(trVal);
    
    const dH = highs[i] - highs[i - 1];
    const dL = lows[i - 1] - lows[i];
    
    plusDm.push(dH > dL && dH > 0 ? dH : 0);
    minusDm.push(dL > dH && dL > 0 ? dL : 0);
  }
  
  // Wilders smooth totals
  let trSum = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let pDmSum = plusDm.slice(0, period).reduce((a, b) => a + b, 0);
  let mDmSum = minusDm.slice(0, period).reduce((a, b) => a + b, 0);
  
  const dx: number[] = [];
  
  let pDi = trSum > 0 ? 100 * (pDmSum / trSum) : 0;
  let mDi = trSum > 0 ? 100 * (mDmSum / trSum) : 0;
  dx.push(pDi + mDi === 0 ? 0 : 100 * (Math.abs(pDi - mDi) / (pDi + mDi)));
  
  for (let i = period; i < closes.length; i++) {
    trSum = trSum - trSum / period + tr[i];
    pDmSum = pDmSum - pDmSum / period + plusDm[i];
    mDmSum = mDmSum - mDmSum / period + minusDm[i];
    
    pDi = trSum > 0 ? 100 * (pDmSum / trSum) : 0;
    mDi = trSum > 0 ? 100 * (mDmSum / trSum) : 0;
    
    const dxVal = pDi + mDi === 0 ? 0 : 100 * (Math.abs(pDi - mDi) / (pDi + mDi));
    dx.push(dxVal);
  }
  
  // EMA of DX gives ADX
  const adxEma = computeEmaArray(dx, period);
  for (let i = 0; i < adxEma.length; i++) {
    // Offset array properly
    if (i + period < adx.length) {
      adx[i + period] = adxEma[i];
    }
  }
  
  return adx;
}


// -----------------------------------------------------------------------------
