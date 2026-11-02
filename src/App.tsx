import { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, Ellipsis, Headphones, Keyboard, Pause, Trash2, X } from 'lucide-react';
import { Orb } from './Orb';
import { GuidedTour, TOUR_KEY } from './GuidedTour';
import { VoicePanel } from './VoicePanel';
import { blobToBase64, loadVoice, prepareReference, saveVoice, type VoiceProfile } from './audio';

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
  const [voiceReady, setVoiceReady] = useState(false);
  const [consent, setConsent] = useState(false); const [savingVoice, setSavingVoice] = useState(false);
  const [storyEntry, setStoryEntry] = useState(false); const [libraryOpen, setLibraryOpen] = useState(false);
  const [notice, setNotice] = useState('');
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
  const libraryPanel = useRef<HTMLElement | null>(null);
  const frame = useRef(0); const currentUrl = useRef(''); const request = useRef<AbortController | null>(null);
  const recordingGeneration = useRef(0);
  const recordingKind = useRef<'voice' | 'message'>('message');
  const auto = useRef(false); const discardRecording = useRef(false); const restartTimer = useRef<number | undefined>(undefined);
  const recordRef = useRef<(automatic?: boolean) => Promise<void>>(async () => {});
  const converseRef = useRef<(blob?: Blob, text?: string) => Promise<void>>(async () => {});
  const busy = mode === 'thinking' || mode === 'connecting'; const locked = busy || mode === 'listening' || session;

  useEffect(() => { let mounted = true; void loadVoice().then(saved => { if (mounted) setProfile(saved); }).catch(() => {}).finally(() => { if (mounted) setVoiceReady(true); }); return () => { mounted = false; }; }, []);
  useEffect(() => { try { localStorage.setItem('yaad-memories', JSON.stringify(memories)); } catch { setError('Browser storage is unavailable. Keep this tab open to retain your memories.'); } }, [memories]);

  useEffect(() => {
    if (!libraryOpen) return;
    const previous = document.activeElement as HTMLElement; const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [libraryOpen]);

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
    endSession(true); stopReply(); setAnswer(null); setHasReplyAudio(false); setShowText(false); setTyped(''); setError(''); setMenu(null); setMode('idle'); setStoryEntry(false); setConsent(false); setNotice('');
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
    const nextPage = next === 1 || next === 2 ? 'memories' : next === 3 ? 'conversation' : page;
    if (nextPage !== page) navigate(nextPage);
    setTourStep(next);
  }
  async function keepVoice(blob: Blob, generation: number) {
    setSavingVoice(true); setMode('thinking');
    try {
      const reference = await prepareReference(blob);
      if (generation !== recordingGeneration.current) return;
      const next: VoiceProfile = { id: crypto.randomUUID(), name: 'Saved voice', ...reference, consent: true };
      await saveVoice(next);
      if (generation !== recordingGeneration.current) return;
      stopReply(); replyBuffer.current = null; setHasReplyAudio(false);
      setProfile(next); setConsent(false); setAnswer(null); setStoryEntry(false); setShowText(false); setTyped('');
      setPage('conversation'); historyPush('conversation'); setMode('idle'); setNotice('Voice saved. Let’s give it new words.');
    } catch (e) { if (generation === recordingGeneration.current) { setMode('idle'); setError(e instanceof Error ? e.message : 'Could not save this voice. Please try again.'); } }
    finally { setSavingVoice(false); }
  }

  async function getContext() { if (!context.current || context.current.state === 'closed') context.current = new AudioContext(); await context.current.resume(); return context.current; }
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
    stopReply(); replyBuffer.current = null; setPlaybackBlocked(false); setHasReplyAudio(false); setMode('thinking'); setError(''); setAnswer(null); setNotice('');
    const requestMode = previewVoice ? 'speak' : page === 'memories' ? 'record' : 'chat';
    const chosen = previewVoice || profile;
    if (!chosen) { setMode('idle'); setError('Record a voice on Memories first.'); return; }
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

  async function record(automatic = false, capture = false) {
    setMenu(null); setError('');
    if (capture && !consent) { setError('Confirm permission below the orb before recording this voice.'); return; }
    const generation = ++recordingGeneration.current;
    recordingKind.current = capture ? 'voice' : 'message';
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { endSession(); setError('Recording needs a supported browser on HTTPS or localhost. Use the keyboard to type instead.'); return; }
    stopReply(); setMode('connecting'); discardRecording.current = false;
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
        if (chunks.length) {
          const blob = new Blob(chunks, { type: r.mimeType });
          if (capture) void keepVoice(blob, generation);
          else void converseRef.current(blob);
        }
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
    if (!voiceReady || savingVoice) return;
    if (session) { endSession(true); return; }
    if (mode === 'listening') { recorder.current?.stop(); return; }
    if (mode === 'talking') { stopReply(true); setMode('ready'); return; }
    if (busy) return;
    if (page === 'memories' && !storyEntry) { void record(false, true); return; }
    if (!profile) { navigate('memories'); return; }
    void record(page === 'conversation');
  }
  function sendText(text: string) {
    if (locked || !text.trim()) return;
    if (!profile) { navigate('memories'); setNotice('Save a voice first. Then choose what it says.'); return; }
    endSession(); void converse(undefined, text.trim());
  }
  async function play() {
    endSession(); setError(''); if (!replyBuffer.current) return;
    if (mode === 'talking') { stopReply(true); setMode('ready'); return; }
    try { startReply(await getContext()); setMode('talking'); } catch { setPlaybackBlocked(true); setMode('ready'); setError('Couldn’t start playback. Check your device audio and try again.'); }
  }
  useEffect(() => {
    if (mode !== 'listening') return;
    const timer = window.setInterval(() => setSeconds(s => s + 1), 1000);
    const limit = window.setTimeout(() => { if (recorder.current?.state === 'recording') recorder.current.stop(); }, recordingKind.current === 'voice' ? 12000 : 25000);
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
  const conversation = page === 'conversation';
  const capturing = !conversation && !storyEntry;
  const title = conversation ? 'Your voice.\nNew words.' : storyEntry ? 'Keep a little story.' : 'A voice worth keeping.';
  const orbLabel = !voiceReady ? 'Loading saved voice' : session ? 'End conversation' : mode === 'listening' ? capturing ? 'Stop and save voice' : 'Finish recording' : mode === 'talking' ? 'Pause reply' : capturing ? 'Record and save voice' : !profile ? 'Record a voice first' : conversation ? 'Start conversation' : 'Record a memory';
  const status = savingVoice ? 'Keeping your voice…' : mode === 'thinking' ? 'Finding the words…' : mode === 'listening' ? `Listening · ${seconds}s${capturing ? ' · tap to save' : ''}` : mode === 'talking' ? 'Tap the orb to pause' : mode === 'connecting' ? 'Opening your microphone…' : session ? 'Ready for your next thought' : capturing ? 'Tap the orb to record' : !profile ? 'Tap the orb to save a voice first' : 'Tap the orb to speak';

  return <><main className={`phone-shell simple-shell page-${page} ${answer ? 'has-answer' : ''} ${showText ? 'has-text' : ''}`} data-tour-step={tourStep ?? undefined}>
    <header className="appbar">
      <a className="brand" href="/conversation" onClick={e => { e.preventDefault(); if (!locked) navigate('conversation'); }} aria-label="Yaad home">yaad<span className="brand-period">.</span></a>
      <nav className="page-nav glass-panel" aria-label="Main navigation"><a data-tour="record-mode" href="/memories" aria-current={!conversation ? 'page' : undefined} aria-disabled={locked} onClick={e => { e.preventDefault(); if (!locked) navigate('memories'); }}>Memories</a><a data-tour="ask-mode" href="/conversation" aria-current={conversation ? 'page' : undefined} aria-disabled={locked} onClick={e => { e.preventDefault(); if (!locked) navigate('conversation'); }}>Conversation</a></nav>
      <div className="header-actions"><div className="popover-anchor" data-tour="language"><button className="language glass-small" aria-label="Reply language" disabled={locked} onClick={() => setMenu(menu === 'language' ? null : 'language')} aria-expanded={menu === 'language'}>{LANGUAGES.find(l => l.code === language)?.name}<ChevronDown size={12}/></button>{menu === 'language' && <div className="popover language-menu">{LANGUAGES.map(l => <button key={l.code} onClick={() => { setLanguage(l.code); setMenu(null); }}>{l.name}{l.code === language && <Check size={14}/>}</button>)}</div>}</div>
      <div className="popover-anchor"><button className="icon-button" aria-label="More options" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><Ellipsis size={22}/></button>{menu === 'more' && <div className="popover about-menu"><button disabled={locked} onClick={() => { resetExperience(); setTourStep(0); }}>Quick guide</button>{profile && <button disabled={locked} onClick={() => { setVoicePanel(true); setMenu(null); }}>Saved voice</button>}<button disabled={locked || !profile} onClick={() => { navigate('memories'); setStoryEntry(true); setShowText(true); }}>Save a story</button><button disabled={locked} onClick={() => { setLibraryOpen(true); setMenu(null); }}>Saved stories</button>{conversation && history.length > 0 && <button disabled={locked} onClick={() => { resetExperience(); setHistory([]); }}>Clear conversation</button>}{hasReplyAudio && audioUrl && <a href={audioUrl} download="yaad-reply.wav"><ArrowDownToLine size={14}/>Download reply</a>}</div>}</div></div>
    </header>
    <section className="experience" aria-label={conversation ? 'Conversation' : capturing ? 'Preserve a voice' : 'Save a story'}>
      <div className="intro" key={`${page}-${storyEntry}`}><h1>{title}</h1><p>{conversation ? profile ? 'Ask for something you’d love to hear.' : 'Record once. Hear something new in that voice.' : storyEntry ? 'Your story stays in this browser.' : 'Record 10–12 seconds. Keep the sound of you.'}</p></div>
      <div className={`orb-stage ${active ? 'is-active' : ''}`}><div className="orb-aura"/><div className="orb-visual" aria-hidden="true"><Suspense fallback={<div className="orb-loading"/>}><Orb className="orb-canvas" colors={['#eef0f3', '#bac2cc']} seed={73} agentState={mode === 'thinking' ? 'thinking' : mode === 'listening' ? 'listening' : mode === 'talking' ? 'talking' : null} volumeMode={mode === 'thinking' ? 'auto' : 'manual'} inputVolumeRef={inputLevel} outputVolumeRef={outputLevel}/></Suspense></div><div className="orb-shadow"/><button data-tour="record" className={`orb-touch ${mode === 'listening' ? 'is-recording' : ''}`} aria-label={orbLabel} disabled={!voiceReady || (busy && !session)} onClick={micAction}/></div>
      <div className="orb-caption" aria-live="polite">{status}</div>
      {capturing && <div className="capture-permission"><label><input type="checkbox" checked={consent} disabled={locked} onChange={e => setConsent(e.target.checked)}/><span>I have permission to use this voice.</span></label><details><summary>How it’s used</summary><p>The recording stays in this browser and is sent to Sarvam to create new AI-generated speech. New questions never replace this saved voice.</p></details>{profile && <button className="text-action" disabled={locked} onClick={() => navigate('conversation')}>Use my saved voice<ArrowRight size={13}/></button>}</div>}
      <div className="page-content" key={`${page}-content`}>
        {notice && <p className="quiet-notice" role="status">{notice}</p>}
        {answer && <div className="answer-card glass-panel" data-tour="evidence" aria-live="polite"><p className="reply-text">{answer.reply}</p><details><summary>Details</summary><p className="heard">You: {answer.transcript}</p><p className="heard">{answer.voice}</p>{answer.sources.map(id => <p key={id}>{memories.find(m => m.id === id)?.text}</p>)}</details></div>}
        {conversation && !answer && profile && <button className="poem-action text-action" disabled={locked} onClick={() => sendText('Recite the first verse of the public-domain poem Twinkle, Twinkle, Little Star. Return only the poem, without an introduction.')}>Hear Twinkle, Twinkle<ArrowRight size={14}/></button>}
        {showText && <form className="text-entry glass-panel" onSubmit={e => { e.preventDefault(); sendText(typed); }}><input aria-label="Type a memory or question" value={typed} onChange={e => setTyped(e.target.value)} placeholder={conversation ? 'What would you like to hear?' : 'Tell a little story…'} disabled={locked} maxLength={3000}/><button disabled={locked || !typed.trim()} aria-label="Send message"><ArrowRight size={19}/></button></form>}
      </div>
      {error && <div role="alert" className="error"><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError('')}><X size={15}/></button></div>}
      {(conversation || storyEntry) && <div className="quiet-controls"><button className="secondary-control" aria-label="Type instead" disabled={locked || !profile} onClick={() => setShowText(v => !v)}><Keyboard size={20} strokeWidth={1.5}/></button>{hasReplyAudio && <button data-tour="playback" className="secondary-control" aria-label={mode === 'talking' ? 'Pause reply' : 'Play answer'} disabled={mode === 'listening' || busy} onClick={() => void play()}>{mode === 'talking' ? <Pause size={19}/> : <Headphones size={20} strokeWidth={1.5}/>}</button>}</div>}
      {playbackBlocked && <p className="quiet-notice">Tap headphones to enable sound.</p>}
    </section>
    <footer className="simple-footer">{profile ? `${profile.name} · AI-generated speech` : 'Your voice, kept on this device'}</footer>
    {libraryOpen && <div className="sheet-overlay" onKeyDown={e => {
      if (e.key === 'Escape') setLibraryOpen(false);
      if (e.key === 'Tab') {
        const nodes = Array.from(libraryPanel.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') || []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }} onClick={e => { if (e.target === e.currentTarget) setLibraryOpen(false); }}><section ref={libraryPanel} className="voice-sheet story-sheet glass-panel" role="dialog" aria-modal="true" aria-labelledby="library-title"><div className="sheet-heading"><h2 id="library-title">Saved stories</h2><button className="icon-button" aria-label="Close saved stories" onClick={() => setLibraryOpen(false)} autoFocus><X size={20}/></button></div>{memories.length ? [...memories].reverse().map(memory => <article className="memory-card" key={memory.id}><p>{memory.text}</p><div className="memory-card-bottom"><button onClick={() => { setLibraryOpen(false); navigate('conversation'); setShowText(true); setTyped(`Tell me about this recorded memory: ${memory.text.slice(0, 500)}`); }}>Talk about this<ArrowRight size={13}/></button><button aria-label="Delete saved story" onClick={() => { if (window.confirm('Delete this memory transcript?')) { setMemories(previous => previous.filter(m => m.id !== memory.id)); setAnswer(null); } }}><Trash2 size={14}/></button></div></article>) : <p className="quiet-notice">No stories yet. Add one from the more menu.</p>}</section></div>}
  </main>{voicePanel && profile && <VoicePanel profile={profile} onSave={setProfile} onClose={() => setVoicePanel(false)} onRecord={() => { setVoicePanel(false); navigate('memories'); }} onRemove={() => { setVoicePanel(false); setProfile(null); navigate('memories'); }}/ >}{tourStep !== null && <GuidedTour step={tourStep} mode={mode} layoutKey={`${page}-${menu}-${showText}-${Boolean(answer)}-${mode}`} onStep={moveTour} onClose={finishTour}/>}</>;
}
