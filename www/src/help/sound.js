let audioCtx = null

const getAudioContext = () => {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

export default {
  play(type = "done") {
    try {
      const ctx = getAudioContext()
      if (!ctx) return

      const now = ctx.currentTime

      if (type === "confirm") {
        // 待办/待确认提示音：清脆的双音提示 (A5 880Hz -> C#6 1108.73Hz 约 0.25 秒)
        const notes = [
          { freq: 880, start: 0, dur: 0.1 },
          { freq: 1108.73, start: 0.1, dur: 0.15 }
        ]
        notes.forEach(({ freq, start, dur }) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = "sine"
          osc.frequency.setValueAtTime(freq, now + start)

          gain.gain.setValueAtTime(0.12, now + start)
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur)

          osc.connect(gain)
          gain.connect(ctx.destination)

          osc.start(now + start)
          osc.stop(now + start + dur)
        })
      } else {
        // 队列走完/任务完成提示音：温暖的上行三和弦淡出 (C5 523.25Hz -> E5 659.25Hz -> G5 783.99Hz 约 0.45 秒)
        const notes = [
          { freq: 523.25, start: 0, dur: 0.15 },
          { freq: 659.25, start: 0.08, dur: 0.18 },
          { freq: 783.99, start: 0.16, dur: 0.3 }
        ]
        notes.forEach(({ freq, start, dur }) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = "sine"
          osc.frequency.setValueAtTime(freq, now + start)

          gain.gain.setValueAtTime(0.12, now + start)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)

          osc.connect(gain)
          gain.connect(ctx.destination)

          osc.start(now + start)
          osc.stop(now + start + dur)
        })
      }
    } catch (e) {
      console.warn("[Sound] 提示音播放失败:", e)
    }
  }
}
