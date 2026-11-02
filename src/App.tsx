import { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, AudioLines, Check, ChevronDown, Ellipsis, Headphones, Mic, Pause, Plus, ShieldCheck, Square, X } from 'lucide-react';
import { Orb } from './Orb';

type Mode = 'idle' | 'connecting' | 'listening' | 'ready' | 'talking';
export default function App() {
  const [mode, setMode] = useState<Mode>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState('');
  const [format, setFormat] = useState('webm');
  const [language, setLanguage] = useState('English');
  const [menu, setMenu] = useState<'language' | 'more' | null>(null);
  const [error, setError] = useState('');
  const inputLevel = useRef(0), outputLevel = useRef(0);
  const context = useRef<AudioContext | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const source = useRef<AudioNode | null>(null);
  const playbackSource = useRef<MediaElementAudioSourceNode | null>(null);
  const frame = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const upload = useRef<HTMLInputElement | null>(null);
  const currentUrl = useRef('');

  function stopMeter() {
    cancelAnimationFrame(frame.current);
    source.current?.disconnect(); source.current = null;
    analyser.current?.disconnect(); analyser.current = null;
    inputLevel.current = 0; outputLevel.current = 0;
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
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = URL.createObjectURL(blob);
    setAudioUrl(currentUrl.current); setFormat(extension); setMode('ready');
  }
  async function record() {
    setMenu(null); setError('');
    if (mode === 'connecting') return;
    if (mode === 'listening') { recorder.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording needs a supported browser on HTTPS or localhost. You can also add an audio file.'); return;
    }
    audio.current?.pause(); stopMeter(); setMode('connecting');
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
        if (chunks.length) replaceAudio(new Blob(chunks, { type: r.mimeType }), r.mimeType.includes('mp4') ? 'm4a' : 'webm');
        else { setMode(currentUrl.current ? 'ready' : 'idle'); setError('No audio was captured. Try recording again.'); }
      };
      recorder.current = r; setSeconds(0); r.start(250); setMode('listening');
    } catch (e) {
      stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; stopMeter();
      setMode(currentUrl.current ? 'ready' : 'idle');
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Microphone access is off. Allow it in your browser, or add a voice note.' : 'Couldn’t start the microphone. Try again or add a voice note.');
    }
  }
  async function play() {
    setError(''); if (!audio.current || !audioUrl) return;
    if (mode === 'talking') { audio.current.pause(); stopMeter(); setMode('ready'); return; }
    try {
      const ctx = await getContext();
      playbackSource.current ??= ctx.createMediaElementSource(audio.current);
      meter(playbackSource.current, ctx, true);
      await audio.current.play(); setMode('talking');
    } catch { stopMeter(); setMode('ready'); setError('Couldn’t play this audio. Try another file.'); }
  }
  useEffect(() => {
    if (mode !== 'listening') return;
    const timer = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [mode]);
  useEffect(() => () => {
    if (recorder.current?.state === 'recording') { recorder.current.onstop = null; recorder.current.stop(); }
    stream.current?.getTracks().forEach(t => t.stop()); cancelAnimationFrame(frame.current);
    source.current?.disconnect(); void context.current?.close();
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
  }, []);
  const active = mode === 'listening' || mode === 'talking';
  const title = mode === 'listening' ? 'Some stories start with you.' : mode === 'talking' ? 'A voice worth keeping.' : mode === 'ready' ? 'A little memory, held close.' : 'Every voice holds a story.';
  const subtitle = mode === 'listening' ? 'Take your time. I’m listening.' : mode === 'talking' ? 'Listening back to your memory.' : mode === 'ready' ? 'Listen back, or tell another story.' : 'A little space for the stories that stay.';
  const clock = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  return <main className="phone-shell">
    <header className="appbar">
      <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="Yaad home"><span className="brand-symbol"><AudioLines size={17} strokeWidth={1.7}/></span>yaad<span className="brand-period">.</span></a>
      <div className="header-actions">
        <div className="popover-anchor"><button className="language glass-small" onClick={() => setMenu(menu === 'language' ? null : 'language')} aria-expanded={menu === 'language'}>{language}<ChevronDown size={12}/></button>
          {menu === 'language' && <div className="popover language-menu">{['English', 'मराठी', 'हिन्दी'].map(l => <button key={l} onClick={() => { setLanguage(l); setMenu(null); }}>{l}{l === language && <Check size={14}/>}</button>)}<p>Memory language label</p></div>}
        </div>
        <div className="popover-anchor"><button className="icon-button more" aria-label="More options" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><Ellipsis size={21}/></button>
          {menu === 'more' && <div className="popover about-menu"><strong>Your voice, your space.</strong><p>This UI preview records and plays audio on your device. AI conversation and voice cloning aren’t connected yet.</p>{audioUrl && <a href={audioUrl} download={`yaad-memory.${format}`}><ArrowDownToLine size={14}/>Download memory</a>}</div>}
        </div>
      </div>
    </header>
    <section className="experience">
      <div className="intro"><div className="eyebrow"><span/>VOICE TIME CAPSULE</div><h1>{title}</h1><p>{subtitle}</p></div>
      <div className={`orb-stage ${active ? 'is-active' : ''}`} aria-label={mode === 'listening' ? 'Orb reacting to your microphone' : mode === 'talking' ? 'Orb reacting to audio playback' : 'Animated silver voice orb'}>
        <div className="orb-aura"/>
        <Suspense fallback={<div className="orb-loading"/>}><Orb className="orb-canvas" colors={['#eef0f3', '#bac2cc']} seed={73} agentState={mode === 'listening' ? 'listening' : mode === 'talking' ? 'talking' : null} volumeMode="manual" inputVolumeRef={inputLevel} outputVolumeRef={outputLevel}/></Suspense>
        <div className="orb-shadow"/>
      </div>
      <div className="orb-caption" aria-live="polite"><span className={`state-dot ${active ? 'active' : ''}`}/>{mode === 'listening' ? `Listening · ${clock}` : mode === 'talking' ? 'Playing your memory' : mode === 'connecting' ? 'Connecting your microphone' : mode === 'ready' ? 'Memory ready to replay' : 'Ready when you are'}</div>
      <div className="prompt-area"><span className="prompt-label">A PLACE TO BEGIN</span><p>“What’s a small memory<br/>that still makes you smile?”</p></div>
    </section>
    <footer className="bottom-area">
      {error && <div role="alert" className="error"><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError('')}><X size={15}/></button></div>}
      <div className="control-dock">
        <button className="secondary-control" aria-label="Add a voice note" disabled={mode === 'listening' || mode === 'connecting'} onClick={() => { audio.current?.pause(); stopMeter(); if (audioUrl) setMode('ready'); upload.current?.click(); }}><Plus size={23} strokeWidth={1.5}/></button>
        <button className={`record-control ${mode === 'listening' ? 'recording' : ''}`} disabled={mode === 'connecting'} onClick={() => void record()} aria-label={mode === 'listening' ? 'Finish recording' : 'Start recording'}>{mode === 'listening' ? <Square size={17} fill="currentColor"/> : <Mic size={23} strokeWidth={1.7}/>}</button>
        <button className="secondary-control" aria-label={mode === 'talking' ? 'Pause memory' : 'Listen to memory'} disabled={!audioUrl || mode === 'listening' || mode === 'connecting'} onClick={() => void play()}>{mode === 'talking' ? <Pause size={21} fill="currentColor"/> : <Headphones size={22} strokeWidth={1.5}/>}</button>
      </div>
      <p className="tap-hint">{mode === 'listening' ? 'Tap to finish your memory' : mode === 'connecting' ? 'Allow microphone access to begin' : 'Tap the mic. Make a little memory.'}</p>
      <div className="privacy"><ShieldCheck size={12} strokeWidth={1.5}/><span>Audio stays on this device</span></div>
    </footer>
    <input className="visually-hidden" ref={upload} type="file" accept="audio/*" aria-label="Choose an audio memory" onChange={e => { const f = e.target.files?.[0]; if (f) { replaceAudio(f, f.name.split('.').pop() || 'audio'); setError(''); } e.target.value = ''; }}/>
    <audio ref={audio} src={audioUrl || undefined} onEnded={() => { stopMeter(); setMode('ready'); }} onError={() => { if (audioUrl) { stopMeter(); setMode('ready'); setError('This audio format isn’t supported by your browser. Try MP3, WAV, or M4A.'); } }}/>
  </main>;
}
