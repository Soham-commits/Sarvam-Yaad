import { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, AudioLines, Check, ChevronDown, Ellipsis, Headphones, Mic, Pause, Keyboard, ShieldCheck, Square, X } from 'lucide-react';
import { Orb } from './Orb';

type Mode = 'idle' | 'connecting' | 'listening' | 'ready' | 'talking' | 'thinking';
type Memory = {id:string; text:string};
const LANGUAGES = [{name:'English',code:'en-IN'}, {name:'हिन्दी',code:'hi-IN'}, {name:'मराठी',code:'mr-IN'}, {name:'বাংলা',code:'bn-IN'}, {name:'தமிழ்',code:'ta-IN'}, {name:'తెలుగు',code:'te-IN'}, {name:'ગુજરાતી',code:'gu-IN'}, {name:'ಕನ್ನಡ',code:'kn-IN'}, {name:'മലയാളം',code:'ml-IN'}, {name:'ਪੰਜਾਬੀ',code:'pa-IN'}, {name:'ଓଡ଼ିଆ',code:'od-IN'}];
export default function App() {
  const [mode, setMode] = useState<Mode>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState('');
  const [format, setFormat] = useState('webm');
  const [language, setLanguage] = useState('English');
  const [menu, setMenu] = useState<'language' | 'more' | null>(null);
  const [error, setError] = useState('');
  const [task, setTask] = useState<'record' | 'ask'>('record');
  const [typed, setTyped] = useState('');
  const [showText, setShowText] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [hasReplyAudio, setHasReplyAudio] = useState(false);
  const [memories, setMemories] = useState<Memory[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('yaad-memories') || '[]'); return Array.isArray(saved) ? saved.filter(m => typeof m.id === 'string' && typeof m.text === 'string').slice(-15) : []; } catch { return []; }
  });
  const [answer, setAnswer] = useState<{transcript:string; reply:string; sources:string[]; elapsed:number; language?:string} | null>(null);
  const inputLevel = useRef(0), outputLevel = useRef(0);
  const context = useRef<AudioContext | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const source = useRef<AudioNode | null>(null);
  const playbackSource = useRef<MediaElementAudioSourceNode | null>(null);
  const replyBuffer = useRef<AudioBuffer | null>(null);
  const replySource = useRef<AudioBufferSourceNode | null>(null);
  const replyOffset = useRef(0);
  const replyStartedAt = useRef(0);
  const frame = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const upload = useRef<HTMLInputElement | null>(null);
  const currentUrl = useRef('');
  const busy = mode === 'thinking' || mode === 'connecting';
  useEffect(() => { try { localStorage.setItem('yaad-memories', JSON.stringify(memories)); } catch { setError('Browser storage is full. Keep this tab open to retain your memories.'); } }, [memories]);
  async function converse(blob?: Blob, text?: string) {
    stopReply(); setPlaybackBlocked(false); setHasReplyAudio(false);
    setMode('thinking'); setError(''); setAnswer(null); audio.current?.pause(); stopMeter();
    try {
      await getContext();
      let encoded: string | undefined;
      if (blob) encoded = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
      const response = await fetch('/api/converse', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({audio:encoded,mime:blob?.type,text,mode:task,language:LANGUAGES.find(l => l.name === language)?.code || 'en-IN', memories}), signal:AbortSignal.timeout(120000)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sarvam request failed. Please try again.');
      setAnswer(result); setTyped(''); setShowText(false);
      if (task === 'record') setMemories(previous => [...previous, {id:crypto.randomUUID(),text:result.transcript}].slice(-15));
      if (result.warning) setError(result.warning);
      if (result.audio) {
        const bytes = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0));
        const voiceBlob = new Blob([bytes],{type:'audio/wav'});
        replaceAudio(voiceBlob,'wav');
        setHasReplyAudio(true);
        try {
          const ctx = await getContext();
          replyBuffer.current = await ctx.decodeAudioData(bytes.buffer.slice(0));
          startReply(ctx); setMode('talking');
        } catch { stopMeter(); setMode('ready'); setPlaybackBlocked(true); }
      } else setMode('ready');
    } catch (e) { setMode(currentUrl.current ? 'ready' : 'idle'); setError(e instanceof Error ? e.message : 'Couldn’t reach Sarvam. Please try again.'); }
  }

  function stopMeter() {
    cancelAnimationFrame(frame.current);
    source.current?.disconnect(); source.current = null;
    analyser.current?.disconnect(); analyser.current = null;
    inputLevel.current = 0; outputLevel.current = 0;
  }
  function stopReply(pause = false) {
    if (pause && replySource.current && context.current) replyOffset.current += context.current.currentTime - replyStartedAt.current;
    else if (!pause) replyOffset.current = 0;
    if (replySource.current) { replySource.current.onended = null; replySource.current.stop(); replySource.current.disconnect(); replySource.current = null; }
  }
  function startReply(ctx: AudioContext) {
    if (!replyBuffer.current) return;
    const node = ctx.createBufferSource(); node.buffer = replyBuffer.current;
    if (replyOffset.current >= node.buffer.duration) replyOffset.current = 0;
    meter(node,ctx,true); replySource.current = node; replyStartedAt.current = ctx.currentTime;
    node.onended = () => { replySource.current = null; replyOffset.current = 0; stopMeter(); setMode('ready'); };
    node.start(0,replyOffset.current); setPlaybackBlocked(false);
  }
  async function getContext() {
    context.current ??= new AudioContext();
    await context.current.resume();
    return context.current;
  }
  function meter(node: AudioNode, ctx: AudioContext, output: boolean) {
    stopMeter();
    const a = ctx.createAnalyser(); a.fftSize = 512; a.smoothingTimeConstant = .75;
    node.connect(a); if (output) a.connect(ctx.destination);
    source.current = node; analyser.current = a;
    const values = new Uint8Array(a.fftSize);
    const tick = () => {
      a.getByteTimeDomainData(values);
      const rms = Math.sqrt(values.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / values.length);
      const ref = output ? outputLevel : inputLevel;
      ref.current += (Math.min(1, rms * 5) - ref.current) * .35;
      frame.current = requestAnimationFrame(tick);
    }; tick();
  }
  function replaceAudio(blob: Blob, extension: string) {
    stopReply(); replyBuffer.current = null;
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = URL.createObjectURL(blob);
    setAudioUrl(currentUrl.current); setFormat(extension); setMode('ready');
  }
  async function record() {
    setMenu(null); setError('');
    if (busy) return;
    if (mode === 'listening') { recorder.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording needs a supported browser on HTTPS or localhost. Use the keyboard button to type instead.'); return;
    }
    stopReply(); audio.current?.pause(); stopMeter(); setMode('connecting');
    try {
      const ctx = await getContext();
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      meter(ctx.createMediaStreamSource(s), ctx, false);
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        s.getTracks().forEach(t => t.stop()); stream.current = null; stopMeter();
        if (chunks.length) { const blob = new Blob(chunks, { type:r.mimeType }); replaceAudio(blob,r.mimeType.includes('mp4') ? 'm4a' : 'webm'); void converse(blob); }
        else { setMode(currentUrl.current ? 'ready' : 'idle'); setError('No audio was captured. Try recording again.'); }
      };
      recorder.current = r; setSeconds(0); r.start(250); setMode('listening');
    } catch (e) {
      stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; stopMeter();
      setMode(currentUrl.current ? 'ready' : 'idle');
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Microphone access is off. Allow it in your browser, or tap the keyboard to type.' : 'Couldn’t start the microphone. Try again or tap the keyboard to type.');
    }
  }
  async function play() {
    setError(''); if (!audio.current || !audioUrl) return;
    if (mode === 'talking') { stopReply(true); audio.current.pause(); stopMeter(); setMode('ready'); return; }
    try {
      const ctx = await getContext();
      if (replyBuffer.current) { startReply(ctx); setMode('talking'); return; }
      playbackSource.current ??= ctx.createMediaElementSource(audio.current);
      meter(playbackSource.current, ctx, true);
      await audio.current.play(); setMode('talking');
    } catch { stopMeter(); setMode('ready'); setError('Couldn’t play this audio. Try another file.'); }
  }
  useEffect(() => {
    if (mode !== 'listening') return;
    const timer = window.setInterval(() => setSeconds(s => s + 1), 1000);
    const limit = window.setTimeout(() => { if (recorder.current?.state === 'recording') recorder.current.stop(); }, 25000);
    return () => { clearInterval(timer); clearTimeout(limit); };
  }, [mode]);
  useEffect(() => () => {
    if (recorder.current?.state === 'recording') { recorder.current.onstop = null; recorder.current.stop(); }
    stream.current?.getTracks().forEach(t => t.stop()); cancelAnimationFrame(frame.current);
    source.current?.disconnect(); void context.current?.close();
    if (replySource.current) { replySource.current.onended = null; replySource.current.stop(); }
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
  }, []);
  const active = mode === 'listening' || mode === 'talking';
  const title = mode === 'thinking' ? 'Finding the words.' : task === 'ask' ? 'Your memories, a little closer.' : mode === 'listening' ? 'Some stories start with you.' : mode === 'talking' ? 'A voice worth keeping.' : mode === 'ready' ? 'A little memory, held close.' : 'Every voice holds a story.';
  const subtitle = mode === 'thinking' ? 'Sarvam is listening, remembering, and replying.' : mode === 'listening' ? 'Tell a short story. Up to 25 seconds.' : mode === 'talking' ? 'Sarvam’s spoken reply · AI narrator' : task === 'ask' ? 'Ask a question about the stories you’ve saved.' : 'A little space for the stories that stay.';
  const clock = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  return <main className={`phone-shell ${answer ? 'has-answer' : ''} ${showText ? 'has-text' : ''}`}>
    <header className="appbar">
      <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="Yaad home"><span className="brand-symbol"><AudioLines size={17} strokeWidth={1.7}/></span>yaad<span className="brand-period">.</span></a>
      <div className="header-actions">
        <div className="popover-anchor"><button className="language glass-small" disabled={busy || mode === 'listening'} onClick={() => setMenu(menu === 'language' ? null : 'language')} aria-expanded={menu === 'language'}>{language}<ChevronDown size={12}/></button>
          {menu === 'language' && <div className="popover language-menu">{LANGUAGES.map(l => <button key={l.code} onClick={() => { setLanguage(l.name); setMenu(null); }}>{l.name}{l.name === language && <Check size={14}/>}</button>)}<p>Speak and hear replies in your language</p></div>}
        </div>
        <div className="popover-anchor"><button className="icon-button more" aria-label="More options" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><Ellipsis size={21}/></button>
          {menu === 'more' && <div className="popover about-menu"><strong>Your voice, your space.</strong><p>Speech is sent to Sarvam for transcription and replies. Saved transcripts stay in this browser. Spoken replies use an AI narrator, not a cloned family voice.</p><button onClick={() => {setShowText(v => !v);setMenu(null);}}>Type instead</button>{memories.length > 0 && <button onClick={() => { if(window.confirm('Delete saved memory transcripts from this browser?')) {setMemories([]);setAnswer(null);setMenu(null);} }}>Clear {memories.length} saved memories</button>}{audioUrl && <a href={audioUrl} download={`yaad-reply.${format}`}><ArrowDownToLine size={14}/>Download audio</a>}</div>}
        </div>
      </div>
    </header>
    <section className="experience">
      <div className="intro"><h1>{title}</h1><p>{subtitle}</p><div className="task-switch"><button disabled={busy || mode === 'listening'} aria-pressed={task === 'record'} onClick={() => {setTask('record');setAnswer(null);}}>Tell a story</button><button disabled={busy || mode === 'listening'} aria-pressed={task === 'ask'} onClick={() => {setTask('ask');setAnswer(null);}}>Ask my capsule</button></div></div>
      <div className={`orb-stage ${active ? 'is-active' : ''}`} aria-label={mode === 'listening' ? 'Orb reacting to your microphone' : mode === 'talking' ? 'Orb reacting to audio playback' : 'Animated silver voice orb'}>
        <div className="orb-aura"/>
        <Suspense fallback={<div className="orb-loading"/>}><Orb className="orb-canvas" colors={['#eef0f3', '#bac2cc']} seed={73} agentState={mode === 'thinking' ? 'thinking' : mode === 'listening' ? 'listening' : mode === 'talking' ? 'talking' : null} volumeMode={mode === 'thinking' ? 'auto' : 'manual'} inputVolumeRef={inputLevel} outputVolumeRef={outputLevel}/></Suspense>
        <div className="orb-shadow"/>
      </div>
      <div className="orb-caption" aria-live="polite"><span className={`state-dot ${active || mode === 'thinking' ? 'active' : ''}`}/>{mode === 'thinking' ? 'Working with Sarvam…' : mode === 'listening' ? `Listening · ${clock}` : mode === 'talking' ? 'Speaking with Sarvam' : mode === 'connecting' ? 'Connecting your microphone' : mode === 'ready' ? 'Reply ready to replay' : 'Ready when you are'}</div>
      {answer ? <div className="answer-card" aria-live="polite"><span className="prompt-label">{task === 'record' ? 'MEMORY SAVED' : 'FROM YOUR CAPSULE'} · {answer.elapsed}s</span><p className="heard">You: {answer.transcript}</p><p>{answer.reply}</p>{hasReplyAudio && <button className="play-answer" onClick={() => void play()}>{mode === 'talking' ? <Pause size={14}/> : <Headphones size={14}/>} {mode === 'talking' ? 'Pause answer' : `Play answer · ${LANGUAGES.find(l => l.code === answer.language)?.name || language}`}</button>}{playbackBlocked && <p className="heard">Tap Play answer to enable sound on your phone.</p>}{answer.sources.map(id => <details key={id}><summary>Original memory</summary><p>{memories.find(m => m.id === id)?.text}</p></details>)}</div> : <div className="prompt-area"><span className="prompt-label">{task === 'ask' ? `${memories.length} MEMORIES TO EXPLORE` : 'A PLACE TO BEGIN'}</span><p>{task === 'ask' ? '“What did I tell you about my childhood?”' : '“What’s a small memory that still makes you smile?”'}</p></div>}
      {showText && <form className="text-entry" onSubmit={e => {e.preventDefault();if(typed.trim() && !busy) void converse(undefined,typed.trim());}}><input aria-label="Type a memory or question" value={typed} onChange={e => setTyped(e.target.value)} placeholder={task === 'ask' ? 'Ask about a saved memory…' : 'Tell a short memory…'} disabled={busy}/><button disabled={busy || !typed.trim()}>Send</button></form>}
    </section>
    <footer className="bottom-area">
      {error && <div role="alert" className="error"><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError('')}><X size={15}/></button></div>}
      <div className="control-dock">
        <button className="secondary-control" aria-label="Type instead" disabled={mode === 'listening' || busy} onClick={() => setShowText(v => !v)}><Keyboard size={23} strokeWidth={1.5}/></button>
        <button className={`record-control ${mode === 'listening' ? 'recording' : ''}`} disabled={busy} onClick={() => void record()} aria-label={mode === 'listening' ? 'Finish recording' : 'Start recording'}>{mode === 'listening' ? <Square size={17} fill="currentColor"/> : <Mic size={23} strokeWidth={1.7}/>}</button>
        <button className="secondary-control" aria-label={mode === 'talking' ? 'Pause reply' : 'Listen to reply'} disabled={!hasReplyAudio || mode === 'listening' || busy} onClick={() => void play()}>{mode === 'talking' ? <Pause size={21} fill="currentColor"/> : <Headphones size={22} strokeWidth={1.5}/>}</button>
      </div>
      <p className="tap-hint">{mode === 'listening' ? 'Tap to finish your memory' : mode === 'connecting' ? 'Allow microphone access to begin' : 'Tap the mic. Make a little memory.'}</p>
      <div className="privacy"><ShieldCheck size={12} strokeWidth={1.5}/><span>Processed by Sarvam · Memories saved on this device</span></div>
    </footer>
    <input className="visually-hidden" ref={upload} type="file" accept="audio/*" aria-label="Choose an audio memory" onChange={e => { const f = e.target.files?.[0]; if (f) { replaceAudio(f, f.name.split('.').pop() || 'audio'); setError(''); } e.target.value = ''; }}/>
    <audio ref={audio} src={audioUrl || undefined} onEnded={() => { stopMeter(); setMode('ready'); }} onError={() => { if (audioUrl) { stopMeter(); setMode('ready'); setError('This audio format isn’t supported by your browser. Try MP3, WAV, or M4A.'); } }}/>
  </main>;
}
