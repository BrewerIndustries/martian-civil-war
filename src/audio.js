/* Castle Blasters — synthesised sound. No audio files: everything is generated
   with WebAudio so the whole game stays a dependency-free static site. */

const Sfx = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // One second of white noise, reused for every impact/explosion.
    const n = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, n, n);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // Browsers keep the context suspended until a real gesture happens.
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function gate() {
    if (muted) return null;
    const c = ensure();
    if (!c || c.state === 'suspended') return null;
    return c;
  }

  function tone(freq, dur, { type = 'sine', gain = 0.25, sweepTo = null, delay = 0 } = {}) {
    const c = gate();
    if (!c) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, { gain = 0.3, filter = 'lowpass', freq = 900, q = 1, sweepTo = null, delay = 0 } = {}) {
    const c = gate();
    if (!c) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = filter;
    bp.frequency.setValueAtTime(freq, t);
    bp.Q.value = q;
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  return {
    unlock,
    isMuted: () => muted,
    toggleMute() { muted = !muted; if (!muted) unlock(); return muted; },

    launch() {
      noise(0.26, { gain: 0.16, filter: 'bandpass', freq: 500, sweepTo: 1700, q: 1.2 });
      tone(150, 0.16, { type: 'triangle', gain: 0.14, sweepTo: 420 });
    },
    stretch(t01) {           // creak while drawing the catapult back
      tone(90 + t01 * 130, 0.05, { type: 'sawtooth', gain: 0.028 });
    },
    thud(v = 1) {
      noise(0.13, { gain: 0.1 * v, filter: 'lowpass', freq: 420 });
      tone(78, 0.12, { type: 'sine', gain: 0.16 * v, sweepTo: 42 });
    },
    crackWood() {
      noise(0.16, { gain: 0.26, filter: 'bandpass', freq: 1500, sweepTo: 380, q: 1.6 });
      tone(240, 0.1, { type: 'square', gain: 0.06, sweepTo: 90 });
    },
    crackStone() {
      noise(0.3, { gain: 0.3, filter: 'lowpass', freq: 1200, sweepTo: 260 });
      tone(110, 0.22, { type: 'triangle', gain: 0.14, sweepTo: 48 });
    },
    shatterIce() {
      noise(0.24, { gain: 0.2, filter: 'highpass', freq: 2600 });
      [1400, 1900, 2500].forEach((f, i) =>
        tone(f, 0.14, { type: 'triangle', gain: 0.07, sweepTo: f * 1.5, delay: i * 0.035 }));
    },
    clang() {
      [620, 930, 1380].forEach((f, i) => tone(f, 0.35, { type: 'square', gain: 0.05 - i * 0.012 }));
    },
    boom() {
      noise(0.62, { gain: 0.45, filter: 'lowpass', freq: 1500, sweepTo: 90 });
      tone(120, 0.5, { type: 'sine', gain: 0.34, sweepTo: 32 });
      tone(64, 0.7, { type: 'sine', gain: 0.26, sweepTo: 26 });
    },
    guardDown() {
      tone(520, 0.1, { type: 'square', gain: 0.1, sweepTo: 300 });
      tone(300, 0.2, { type: 'triangle', gain: 0.09, sweepTo: 140, delay: 0.07 });
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, 0.42, { type: 'triangle', gain: 0.17, delay: i * 0.1 }));
    },
    lose() {
      [392, 330, 262].forEach((f, i) =>
        tone(f, 0.42, { type: 'triangle', gain: 0.14, delay: i * 0.14 }));
    },
    star(i) {
      tone(700 + i * 260, 0.3, { type: 'triangle', gain: 0.16 });
    },
    click() { tone(660, 0.05, { type: 'square', gain: 0.05 }); },
  };
})();
