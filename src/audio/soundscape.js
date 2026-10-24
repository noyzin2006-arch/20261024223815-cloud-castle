/**
 * 程序化环境声（规划案 §4.3 第 7 条）
 *
 * 全部用 Web Audio 实时合成，不请求任何音频文件：
 *   风 = 带通滤波的白噪声；雨 = 高频噪声 + 轻微调制；钟 = 谐波叠加 + 指数衰减。
 * 必须由用户手势启动；失焦自动 suspend；M 键切换。
 */

export function createSoundscape() {
  /** @type {AudioContext | null} */
  let ctx = null;
  let master = null;
  let windGain = null;
  let rainGain = null;
  let noiseBuffer = null;
  let started = false;
  let muted = true;

  function ensureContext() {
    if (ctx) return ctx;
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // 2 秒白噪声循环，作为风与雨的源
    const length = Math.floor(ctx.sampleRate * 2);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      // 轻度低通，避免过于刺耳
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }

    // 风：带通噪声 + 缓慢的增益起伏
    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = 0.16;
    windSource.connect(windFilter).connect(windGain).connect(master);
    windSource.start();

    // 风的起伏 LFO
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain).connect(windGain.gain);
    lfo.start();

    // 雨：高通噪声
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = noiseBuffer;
    rainSource.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 2400;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rainSource.connect(rainFilter).connect(rainGain).connect(master);
    rainSource.start();

    return ctx;
  }

  /**
   * 由用户手势启动。
   * @returns {boolean} 是否成功启动
   */
  function start() {
    const context = ensureContext();
    if (!context) return false;
    if (context.state === 'suspended') context.resume();
    started = true;
    setMuted(muted);
    return true;
  }

  /**
   * @param {boolean} value
   */
  function setMuted(value) {
    muted = Boolean(value);
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(muted ? 0 : 0.55, now, 0.25);
  }

  /**
   * 依据天气与风速调整混音。
   * @param {{rain:number, mist:number, windSpeed:number}} weatherState
   */
  function update(weatherState) {
    if (!ctx || !windGain || !rainGain) return;
    const now = ctx.currentTime;
    windGain.gain.setTargetAtTime(0.08 + weatherState.windSpeed * 0.13, now, 0.4);
    rainGain.gain.setTargetAtTime(weatherState.rain * 0.3, now, 0.4);
  }

  /** 敲一次钟：谐波叠加 + 指数衰减 */
  function bell() {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    const partials = [1, 2.01, 2.98, 4.07, 5.43];
    const gains = [1, 0.5, 0.32, 0.18, 0.1];
    partials.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 196 * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.16 * gains[i], now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 3.6);
    });
  }

  function suspend() {
    if (ctx && ctx.state === 'running') ctx.suspend();
  }

  function resume() {
    if (ctx && ctx.state === 'suspended' && started) ctx.resume();
  }

  function dispose() {
    ctx?.close?.();
    ctx = null;
    started = false;
  }

  return {
    start,
    setMuted,
    update,
    bell,
    suspend,
    resume,
    dispose,
    get isStarted() { return started; },
    get isMuted() { return muted; },
  };
}
