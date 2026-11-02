import { useEffect, useMemo, useState } from 'react';

type Cue = { words: string[]; start: number; end: number };
// The API returns a complete WAV, not word timestamps. These cues follow audio
// progress approximately; they never pretend to be live model token streaming.
export function Subtitles({ text, duration, getTime }: { text: string; duration: number; getTime: () => number }) {
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const cues = useMemo(() => {
    const words = text.match(/\S+\s*/gu) || [text]; const groups: string[][] = []; let group: string[] = [];
    for (const word of words) {
      if (group.length && (group.join('').length + word.length > 45 || group.length >= 7)) { groups.push(group); group = []; }
      group.push(word);
    }
    if (group.length) groups.push(group);
    const total = Math.max(1, text.length); let offset = 0;
    return groups.map(words => { const start = offset / total; offset += words.join('').length; return { words, start, end: offset / total } as Cue; });
  }, [text]);
  const [position, setPosition] = useState({ cue: 0, word: 0 }); const [plain, setPlain] = useState(reduced);
  useEffect(() => {
    let frame = 0, windowStart = performance.now(), frames = 0, slowWindows = 0;
    let lastCue = -1, lastWord = -1;
    const tick = (now: number) => {
      frames++;
      // Sustained frame pressure drops blur and the card for this utterance.
      if (now - windowStart >= 700) {
        const fps = frames * 1000 / (now - windowStart); slowWindows = fps < 58 ? slowWindows + 1 : 0;
        if (slowWindows >= 2) setPlain(true);
        frames = 0; windowStart = now;
      }
      const fraction = Math.min(.999999, Math.max(0, getTime() / Math.max(.01, duration)));
      let index = cues.findIndex(cue => fraction < cue.end); if (index < 0) index = cues.length - 1;
      const cue = cues[index];
      if (cue) {
        const relative = (fraction - cue.start) / Math.max(.001, cue.end - cue.start);
        const word = reduced ? cue.words.length - 1 : Math.min(cue.words.length - 1, Math.max(0, Math.floor(relative * cue.words.length)));
        if (index !== lastCue || word !== lastWord) { lastCue = index; lastWord = word; setPosition({ cue: index, word }); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [cues, duration, getTime, reduced]);
  const cue = cues[position.cue];
  return <div className={`subtitles ${plain ? 'subtitles-plain' : 'subtitles-glass'}`} data-caption-style={plain ? 'floating' : 'glass'} aria-label="Spoken reply subtitles"><p key={position.cue}>{cue?.words.map((word, index) => <span key={index} className={index <= position.word ? 'spoken-word' : 'upcoming-word'}>{word}</span>)}</p></div>;
}
