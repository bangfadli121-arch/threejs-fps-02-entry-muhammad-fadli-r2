// WebAudio-only sound effects, created lazily after an input gesture.
let context = null;

export function audio() {
  return {
    play(kind = 'shot') {
      try {
        context ??= new (window.AudioContext || window.webkitAudioContext)();
        if (context.state === 'suspended') context.resume();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        const shot = kind === 'shot';
        const ring = kind === 'ring';
        oscillator.type = shot ? 'sawtooth' : ring ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(shot ? 118 : ring ? 920 : kind === 'beep' ? 740 : 190, now);
        oscillator.frequency.exponentialRampToValueAtTime(ring ? 480 : shot ? 58 : 110, now + (ring ? 1.8 : shot ? 0.11 : 0.18));
        gain.gain.setValueAtTime(shot ? 0.09 : ring ? 0.055 : 0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (ring ? 2 : shot ? 0.12 : 0.2));
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + (ring ? 2 : shot ? 0.13 : 0.21));
      } catch {
        // Audio is optional; browsers without WebAudio still render and play normally.
      }
    },
  };
}
