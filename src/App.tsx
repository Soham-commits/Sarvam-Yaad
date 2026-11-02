import { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, Ellipsis, Headphones, Keyboard, MessageCircle, Mic, Pause, Plus, Square, Trash2, X } from 'lucide-react';
import { Orb } from './Orb';
import { GuidedTour, SAMPLE_MEMORY, TOUR_KEY } from './GuidedTour';
import { VoicePanel } from './VoicePanel';
import { blobToBase64, loadVoice, type VoiceProfile } from './audio';

type Page = 'memories' | 'conversation';
type Mode = 'idle' | 'connecting' | 'listening' | 'ready' | 'talking' | 'thinking';
type Memory = { id: string; text: string; createdAt?: string };
type Turn = { role: 'user' | 'assistant'; content: string };
type Answer = { transcript: string; reply: string; sources: string[]; elapsed: number; language: string; voice: string; warning?: string; audio?: string };
const LANGUAGES = [{ name: 'English', code: 'en-IN' }, { name: 'हिन्दी', code: 'hi-IN' }, { name: 'मराठी', code: 'mr-IN' }, { name: 'বাংলা', code: 'bn-IN' }, { name: 'தமிழ்', code: 'ta-IN' }, { name: 'తెలుగు', code: 'te-IN' }, { name: 'ગુજરાતી', code: 'gu-IN' }, { name: 'ಕನ್ನಡ', code: 'kn-IN' }, { name: 'മലയാളം', code: 'ml-IN' }, { name: 'ਪੰਜਾਬੀ', code: 'pa-IN' }, { name: 'ଓଡ଼ିଆ', code: 'od-IN' }];
const currentPage = (): Page => location.pathname === '/memories' ? 'memories' : 'conversation';

export default function App() {
  const [page, setPage] = useState<Page>(currentPage);
  const [mode, setMode] = useState<Mode>('idle');
  const [language, setLanguage] = useState('en-IN');
  const [menu, setMenu] = useState<'language' | 'more' | null>(null);
  const [error, setError] = useState(''); const [seconds, setSeconds] = useState(0);
  const [typed, setTyped] = useState(''); const [showText, setShowText] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null); const [history, setHistory] = useState<Turn[]>([]);
  const [audioUrl, setAudioUrl] = useState(''); const [hasReplyAudio, setHasReplyAudio] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false); const [session, setSession] = useState(false);
  const [voicePanel, setVoicePanel] = useState(false); const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [useClone, setUseClone] = useState(() => { try { return localStorage.getItem('yaad-use-clone') === 'true'; } catch { return false; } }); const [previewing, setPreviewing] = useState(false);
  const [memories, setMemories] = useState<Memory[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('yaad-memories') || '[]'); return Array.isArray(saved) ? saved.filter(m => typeof m.id === 'string' && typeof m.text === 'string').slice(-15) : []; } catch { return []; }
  });
  const [tourStep, setTourStep] = useState<number | null>(() => {
    if (new URLSearchParams(location.search).get('tour') === '1') return 0;
    try { return localStorage.getItem(TOUR_KEY) ? null : 0; } catch { return 0; }
  });
  const inputLevel = useRef(0), outputLevel = useRef(0);
  const context = useRef<AudioContext | null>(null); const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null); const analyser = useRef<AnalyserNode | null>(null);
  const source = useRef<AudioNode | null>(null); const replyBuffer = useRef<AudioBuffer | null>(null);
  const replySource = useRef<AudioBufferSourceNode | null>(null); const replyOffset = useRef(0); const replyStartedAt = useRef(0);
  const frame = useRef(0); const currentUrl = useRef(''); const request = useRef<AbortController | null>(null);
  const recordingGeneration = useRef(0);
  const auto = useRef(false); const discardRecording = useRef(false); const restartTimer = useRef<number | undefined>(undefined);
  const recordRef = useRef<(automatic?: boolean) => Promise<void>>(async () => {});
  const converseRef = useRef<(blob?: Blob, text?: string) => Promise<void>>(async () => {});
  const busy = mode === 'thinking' || mode === 'connecting'; const locked = busy || mode === 'listening' || session;

  useEffect(() => { try { localStorage.setItem('yaad-use-clone', String(useClone)); } catch { /* Selection stays in this session. */ } }, [useClone]);
  useEffect(() => { void loadVoice().then(saved => { setProfile(saved); }).catch(() => {}); }, []);
  useEffect(() => { try { localStorage.setItem('yaad-memories', JSON.stringify(memories)); } catch { setError('Browser storage is unavailable. Keep this tab open to retain your memories.'); } }, [memories]);
  useEffect(() => {
    if (tourStep === 3 && page === 'memories' && answer && mode !== 'thinking' && mode !== 'listening') setTourStep(4);
  }, [tourStep, page, answer, mode]);

  function stopMeter() {
    cancelAnimationFrame(frame.current); source.current?.disconnect(); source.current = null;
    analyser.current?.disconnect(); analyser.current = null; inputLevel.current = 0; outputLevel.current = 0;
  }
  function stopReply(pause = false) {
    if (pause && replySource.current && context.current) replyOffset.current += context.current.currentTime - replyStartedAt.current;
    else if (!pause) replyOffset.current = 0;
    if (replySource.current) { replySource.current.onended = null; replySource.current.stop(); replySource.current.disconnect(); replySource.current = null; }
    stopMeter();
  }
  function endSession(cancelRequest = false) {
    recordingGeneration.current += 1; auto.current = false; setSession(false); window.clearTimeout(restartTimer.current);
    if (recorder.current?.state === 'recording') { discardRecording.current = true; recorder.current.stop(); }
    if (cancelRequest) { request.current?.abort(); stopReply(); setMode('idle'); }
  }
  function resetExperience() {
    endSession(true); stopReply(); setAnswer(null); setHasReplyAudio(false); setShowText(false); setTyped(''); setError(''); setMenu(null); setMode('idle');
  }
  function navigate(next: Page, push = true) {
    resetExperience(); setPage(next);
    if (push) historyPush(next);
  }
  function historyPush(next: Page) { const url = new URL(location.href); url.pathname = `/${next}`; window.history.pushState(null, '', url); }
  useEffect(() => {
    const pop = () => navigate(currentPage(), false);
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  function finishTour() {
    try { localStorage.setItem(TOUR_KEY, 'seen'); } catch { /* The tour remains available without storage. */ }
    const url = new URL(location.href); url.searchParams.delete('tour'); window.history.replaceState(null, '', url); setTourStep(null); setMenu(null);
  }
  function moveTour(next: number) {
    setMenu(null);
    const nextPage = next >= 2 && next <= 4 ? 'memories' : next >= 5 ? 'conversation' : page;
    if (nextPage !== page) navigate(nextPage);
    setTourStep(next);
  }
  function tryExample() { navigate('memories'); finishTour(); setShowText(true); setTyped(SAMPLE_MEMORY); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="Type a memory or question"]')?.focus()); }

  async function getContext() { context.current ??= new AudioContext(); await context.current.resume(); return context.current; }
  function meter(node: AudioNode, ctx: AudioContext, output: boolean) {
    stopMeter(); const a = ctx.createAnalyser(); a.fftSize = 512; a.smoothingTimeConstant = .75;
    node.connect(a); if (output) a.connect(ctx.destination); source.current = node; analyser.current = a;
    const values = new Uint8Array(a.fftSize); const started = performance.now(); let lastSpeech = started; let heardSpeech = false;
    const tick = () => {
      a.getByteTimeDomainData(values);
      const rms = Math.sqrt(values.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / values.length);
      const level = output ? outputLevel : inputLevel; level.current += (Math.min(1, rms * 5) - level.current) * .35;
      if (!output && auto.current && recorder.current?.state === 'recording') {
        const now = performance.now();
        if (rms > .018) { lastSpeech = now; heardSpeech = true; }
        if (heardSpeech && now - lastSpeech > 1800 && now - started > 2000) { recorder.current.stop(); return; }
        if (!heardSpeech && now - started > 12000) { endSession(); setMode('idle'); setError('No speech detected. Tap Start conversation when you’re ready.'); return; }
      }
      frame.current = requestAnimationFrame(tick);
    }; tick();
  }
  function startReply(ctx: AudioContext) {
    if (!replyBuffer.current) return;
    const node = ctx.createBufferSource(); node.buffer = replyBuffer.current;
    if (replyOffset.current >= node.buffer.duration) replyOffset.current = 0;
    meter(node, ctx, true); replySource.current = node; replyStartedAt.current = ctx.currentTime;
    node.onended = () => { replySource.current = null; replyOffset.current = 0; stopMeter(); setMode('ready'); if (auto.current) restartTimer.current = window.setTimeout(() => { if (auto.current) void recordRef.current(true); }, 450); };
    node.start(0, replyOffset.current); setPlaybackBlocked(false);
  }
  async function converse(blob?: Blob, text?: string, previewVoice?: VoiceProfile) {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    stopReply(); replyBuffer.current = null; setPlaybackBlocked(false); setHasReplyAudio(false); setMode('thinking'); setError(''); setAnswer(null);
    const requestMode = previewVoice ? 'speak' : page === 'memories' ? 'record' : 'chat';
    const chosen = previewVoice || (useClone ? profile : null);
    const timer = window.setTimeout(() => controller.abort('timeout'), 120000);
    try {
      await getContext(); const encoded = blob ? await blobToBase64(blob) : undefined;
      const response = await fetch('/api/converse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: encoded, mime: blob?.type, text, mode: requestMode, language, memories, history: previewVoice ? [] : history, voice: chosen ? { audio: chosen.audio, name: chosen.name, consent: chosen.consent } : undefined }), signal: controller.signal });
      const result: Answer & { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not complete this request. Please try again.');
      if (controller.signal.aborted) return;
      if (!previewVoice) { setAnswer(result); setTyped(''); setShowText(false); }
      if (requestMode === 'record') setMemories(previous => [...previous, { id: crypto.randomUUID(), text: result.transcript, createdAt: new Date().toISOString() }].slice(-15));
      if (requestMode === 'chat') setHistory(previous => [...previous, { role: 'user' as const, content: result.transcript }, { role: 'assistant' as const, content: result.reply }].slice(-8));
      if (result.warning) setError(result.warning);
      if (result.audio) {
        const bytes = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0));
        if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
        currentUrl.current = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })); setAudioUrl(currentUrl.current);
        replyBuffer.current = await (await getContext()).decodeAudioData(bytes.buffer.slice(0)); setHasReplyAudio(true);
        try { startReply(await getContext()); setMode('talking'); }
        catch { endSession(); setMode('ready'); setPlaybackBlocked(true); }
      } else { endSession(); setMode('ready'); }
      if (previewVoice && !result.audio) throw new Error(result.warning || 'The cloned voice could not be generated.');
    } catch (e) {
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
      endSession(); setMode('ready');
      const message = controller.signal.reason === 'timeout' ? 'This took too long. Please try a shorter message.' : e instanceof Error ? e.message : 'Couldn’t reach Sarvam. Please try again.';
      setError(message); if (previewVoice) throw new Error(message);
    } finally { clearTimeout(timer); if (request.current === controller) request.current = null; }
  }
  converseRef.current = converse;

  async function record(automatic = false) {
    setMenu(null); setError('');
    const generation = ++recordingGeneration.current;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { endSession(); setError('Recording needs a supported browser on HTTPS or localhost. Use the keyboard to type instead.'); return; }
    stopReply(); replyBuffer.current = null; setHasReplyAudio(false); setMode('connecting'); discardRecording.current = false;
    if (automatic) { auto.current = true; setSession(true); }
    try {
      const ctx = await getContext(); const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (generation !== recordingGeneration.current || (automatic && !auto.current)) { s.getTracks().forEach(t => t.stop()); setMode('idle'); return; }
      stream.current = s;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined); const chunks: Blob[] = [];
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        s.getTracks().forEach(t => t.stop()); stream.current = null; stopMeter();
        if (discardRecording.current) { setMode('idle'); return; }
        if (chunks.length) void converseRef.current(new Blob(chunks, { type: r.mimeType }));
        else { endSession(); setMode('idle'); setError('No audio was captured. Try again.'); }
      };
      recorder.current = r; setSeconds(0); r.start(250); meter(ctx.createMediaStreamSource(s), ctx, false); setMode('listening');
    } catch (e) {
      stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; stopMeter(); endSession(); setMode('idle');
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Allow microphone access in your browser, or use the keyboard to type.' : 'Couldn’t start the microphone. Try again or use the keyboard.');
    }
  }
  recordRef.current = record;
  function micAction() {
    if (session) { endSession(true); return; }
    if (mode === 'listening') { recorder.current?.stop(); return; }
    if (!busy) void record(page === 'conversation');
  }
  function sendText(text: string) { if (locked || !text.trim()) return; endSession(); void converse(undefined, text.trim()); }
  async function play() {
    endSession(); setError(''); if (!replyBuffer.current) return;
    if (mode === 'talking') { stopReply(true); setMode('ready'); return; }
    try { startReply(await getContext()); setMode('talking'); } catch { setPlaybackBlocked(true); setMode('ready'); setError('Couldn’t start playback. Check your device audio and try again.'); }
  }
  useEffect(() => {
    if (mode !== 'listening') return;
    const timer = window.setInterval(() => setSeconds(s => s + 1), 1000);
    const limit = window.setTimeout(() => { if (recorder.current?.state === 'recording') recorder.current.stop(); }, 25000);
    return () => { clearInterval(timer); clearTimeout(limit); };
  }, [mode]);
  useEffect(() => () => {
    auto.current = false; window.clearTimeout(restartTimer.current); request.current?.abort();
    if (recorder.current?.state === 'recording') { recorder.current.onstop = null; recorder.current.stop(); }
    stream.current?.getTracks().forEach(t => t.stop()); cancelAnimationFrame(frame.current); source.current?.disconnect();
    if (replySource.current) { replySource.current.onended = null; replySource.current.stop(); }
    void context.current?.close(); if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
  }, []);

  const active = mode === 'listening' || mode === 'talking';
  const voiceName = useClone && profile ? profile.name : 'Yaad narrator';
  const status = mode === 'thinking' ? 'Finding the words…' : mode === 'listening' ? `Listening · 0:${String(seconds).padStart(2, '0')}` : mode === 'talking' ? `Speaking · ${answer?.voice || voiceName}` : mode === 'connecting' ? 'Opening your microphone…' : session ? 'Ready for your next thought' : 'Ready when you are';
  const conversation = page === 'conversation';
  const title = conversation ? 'A familiar voice.\nA new conversation.' : 'Some moments\ndeserve to stay.';

  return <><main className={`phone-shell page-${page} ${answer ? 'has-answer' : ''} ${showText ? 'has-text' : ''} ${tourStep !== null ? 'tour-running' : ''}`} data-tour-step={tourStep ?? undefined}>
    <header className="appbar">
      <a className="brand" href="/conversation" onClick={e => { e.preventDefault(); if (!locked) navigate('conversation'); }} aria-label="Yaad home">yaad<span className="brand-period">.</span></a>
      <nav className="page-nav glass-panel" aria-label="Main navigation"><a data-tour="record-mode" href="/memories" aria-current={!conversation ? 'page' : undefined} aria-disabled={locked} onClick={e => { e.preventDefault(); if (!locked) { navigate('memories'); if (tourStep === 2) moveTour(3); } }}><BookOpen size={15}/><span>Memories</span></a><a data-tour="ask-mode" href="/conversation" aria-current={conversation ? 'page' : undefined} aria-disabled={locked} onClick={e => { e.preventDefault(); if (!locked) { navigate('conversation'); if (tourStep === 5) moveTour(6); } }}><MessageCircle size={15}/><span>Conversation</span></a></nav>
      <div className="header-actions"><div className="popover-anchor" data-tour="language"><button className="language glass-small" aria-label="Reply language" disabled={locked} onClick={() => setMenu(menu === 'language' ? null : 'language')} aria-expanded={menu === 'language'}>{LANGUAGES.find(l => l.code === language)?.name}<ChevronDown size={12}/></button>{menu === 'language' && <div className="popover language-menu">{LANGUAGES.map(l => <button key={l.code} onClick={() => { setLanguage(l.code); setMenu(null); if (tourStep === 1) moveTour(2); }}>{l.name}{l.code === language && <Check size={14}/>}</button>)}<p>The language you’ll hear back.</p></div>}</div>
      <div className="popover-anchor"><button className="icon-button" aria-label="More options" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><Ellipsis size={22}/></button>{menu === 'more' && <div className="popover about-menu"><strong>Your stories, held close.</strong><p>Memories and your voice reference stay in this browser. Messages and any selected reference are sent to Sarvam to generate replies.</p><button disabled={locked} onClick={() => { resetExperience(); setTourStep(0); }}>Take a guided tour</button><button disabled={locked} onClick={() => { setShowText(v => !v); setMenu(null); }}>Type instead</button><button disabled={locked} onClick={() => { setVoicePanel(true); setMenu(null); }}>Choose a voice</button>{conversation && history.length > 0 && <button disabled={locked} onClick={() => { resetExperience(); setHistory([]); }}>Clear conversation</button>}{memories.length > 0 && <button disabled={locked} onClick={() => { if (window.confirm('Delete all saved memory transcripts from this browser?')) { setMemories([]); setAnswer(null); setMenu(null); } }}>Clear saved memories</button>}{hasReplyAudio && audioUrl && <a href={audioUrl} download="yaad-reply.wav"><ArrowDownToLine size={14}/>Download reply audio</a>}</div>}</div></div>
    </header>
    <section className="experience" aria-label={conversation ? 'Conversation' : 'Save a memory'}>
      <div className="intro" key={page}><span className="section-kicker">{conversation ? 'A LITTLE CLOSER' : 'YOUR MEMORY ROOM'}</span><h1>{title}</h1><p>{conversation ? 'Talk, wonder, or hear a favourite poem.' : 'Give your stories a place of their own.'}</p></div>
      <div className={`orb-stage ${active ? 'is-active' : ''}`} aria-label={mode === 'listening' ? 'Orb reacting to your microphone' : mode === 'talking' ? 'Orb reacting to audio playback' : 'Animated silver voice orb'}><div className="orb-aura"/><Suspense fallback={<div className="orb-loading"/>}><Orb className="orb-canvas" colors={['#eef0f3', '#bac2cc']} seed={73} agentState={mode === 'thinking' ? 'thinking' : mode === 'listening' ? 'listening' : mode === 'talking' ? 'talking' : null} volumeMode={mode === 'thinking' ? 'auto' : 'manual'} inputVolumeRef={inputLevel} outputVolumeRef={outputLevel}/></Suspense><div className="orb-shadow"/></div>
      <div className="orb-caption" aria-live="polite"><span className={`state-dot ${active || busy ? 'active' : ''}`}/>{status}</div>
      <button data-tour="voice" className="voice-pill glass-small" disabled={locked} onClick={() => setVoicePanel(true)}><span className="voice-dot"/>{voiceName}<ChevronDown size={12}/></button>
      <div className="page-content" key={`${page}-content`}>
        {answer ? <div className="answer-card glass-panel" data-tour="evidence" aria-live="polite"><div className="answer-meta"><span className="section-kicker">{!conversation ? 'MEMORY SAVED' : 'A MOMENT TO LISTEN'}</span><span>{answer.elapsed}s</span></div><p className="heard">You: {answer.transcript}</p><p className="reply-text">{answer.reply}</p>{hasReplyAudio && <button className="play-answer" onClick={() => void play()}>{mode === 'talking' ? <Pause size={14}/> : <Headphones size={14}/>} {mode === 'talking' ? 'Pause answer' : 'Play answer'}<span>· {answer.voice}</span></button>}{playbackBlocked && <p className="heard">Tap Play answer to enable sound.</p>}{answer.sources.map(id => <details key={id}><summary>Original memory</summary><p>{memories.find(m => m.id === id)?.text}</p></details>)}</div> : <div className="prompt-area" data-tour="evidence"><p>{conversation ? 'What would you like to hear today?' : '“What’s a small memory that still makes you smile?”'}</p></div>}
        {conversation && !answer && <div className="suggestions"><button disabled={locked} onClick={() => sendText('Recite the first verse of the public-domain poem Twinkle, Twinkle, Little Star. Return only the poem, without an introduction.')}><span>Twinkle, Twinkle</span><small>A little poem, out loud</small><ArrowRight size={15}/></button><button disabled={locked} onClick={() => sendText('What have I shared about my childhood? Use only my recorded memories; say if I have not saved any.')}><span>Back to a memory</span><small>{memories.length ? `${memories.length} stories to return to` : 'Save your first story in Memories'}</small><ArrowRight size={15}/></button></div>}
        {showText && <form className="text-entry glass-panel" onSubmit={e => { e.preventDefault(); sendText(typed); }}><input aria-label="Type a memory or question" value={typed} onChange={e => setTyped(e.target.value)} placeholder={conversation ? 'Ask something, or request a poem…' : 'Tell a little story…'} disabled={locked} maxLength={3000}/><button disabled={locked || !typed.trim()} aria-label="Send message"><ArrowRight size={19}/></button></form>}
      </div>
    </section>
    <footer className="bottom-area">{error && <div role="alert" className="error"><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError('')}><X size={15}/></button></div>}<div className="control-dock glass-panel"><button className="secondary-control" aria-label="Type instead" disabled={locked} onClick={() => setShowText(v => !v)}><Keyboard size={22} strokeWidth={1.5}/></button><button data-tour="record" className={`record-control ${mode === 'listening' || session ? 'recording' : ''}`} disabled={busy && !session} onClick={micAction} aria-label={session ? 'End conversation' : mode === 'listening' ? 'Finish recording' : conversation ? 'Start conversation' : 'Record a memory'}>{mode === 'listening' || session ? <Square size={17} fill="currentColor"/> : <Mic size={24} strokeWidth={1.6}/>}</button><button data-tour="playback" className="secondary-control" aria-label={mode === 'talking' ? 'Pause reply' : 'Listen to reply'} disabled={!hasReplyAudio || mode === 'listening' || busy} onClick={() => void play()}>{mode === 'talking' ? <Pause size={20}/> : <Headphones size={22} strokeWidth={1.5}/>}</button></div><p className="tap-hint">{session ? 'Hands-free is on · Tap the square to end' : mode === 'listening' ? 'Tap the square to save your memory' : conversation ? 'One tap to start a conversation' : 'Tap to record. Tap again to keep it.'}</p><p className="privacy">{useClone && profile ? 'AI-generated speech using your selected reference' : 'Spoken by the Yaad narrator'} · Powered by Sarvam</p></footer>
    {!conversation && <section className="memory-library" aria-labelledby="library-title"><div className="library-heading"><div><span className="section-kicker">KEPT ON THIS DEVICE</span><h2 id="library-title">Your little collection<span>{memories.length.toString().padStart(2, '0')}</span></h2></div><button className="glass-small add-memory" disabled={locked} onClick={() => { setShowText(true); window.scrollTo({ top: 0, behavior: 'smooth' }); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="Type a memory or question"]')?.focus()); }}><Plus size={16}/>Add a story</button></div>{memories.length ? <div className="memory-grid">{[...memories].reverse().map((memory, index) => <article className="memory-card glass-panel" key={memory.id} style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}><div className="memory-card-top"><span>STORY {String(memories.length - index).padStart(2, '0')}</span><button disabled={locked} aria-label={`Delete story ${memories.length - index}`} onClick={() => { if (window.confirm('Delete this memory transcript?')) { setMemories(previous => previous.filter(m => m.id !== memory.id)); setAnswer(null); } }}><Trash2 size={14}/></button></div><p>{memory.text}</p><div className="memory-card-bottom"><span>{memory.createdAt ? new Date(memory.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Saved memory'}</span><button disabled={locked} onClick={() => { navigate('conversation'); setShowText(true); setTyped(`Tell me about this recorded memory: ${memory.text.slice(0, 500)}`); }}>Talk about this<ArrowRight size={13}/></button></div></article>)}</div> : <div className="empty-library"><BookOpen size={24} strokeWidth={1}/><p>Your first story belongs here.</p><span>Speak or type above. The last 15 stories stay in this browser.</span></div>}</section>}
  </main>{voicePanel && <VoicePanel profile={profile} selected={useClone} onSelect={setUseClone} onSave={setProfile} onClose={() => { request.current?.abort(); setPreviewing(false); stopReply(); setMode('ready'); setVoicePanel(false); }} previewing={previewing} onPreview={async () => { if (!profile) return; setPreviewing(true); try { await converse(undefined, language === 'en-IN' ? 'A little story, a familiar voice. Welcome to Yaad.' : 'नमस्ते। याद में आपका स्वागत है।', profile); } finally { setPreviewing(false); } }}/ >}{tourStep !== null && <GuidedTour step={tourStep} mode={mode} error={error} layoutKey={`${page}-${menu}-${showText}-${Boolean(answer)}-${mode}`} onStep={moveTour} onClose={finishTour} onExample={tryExample}/>}</>;
}
