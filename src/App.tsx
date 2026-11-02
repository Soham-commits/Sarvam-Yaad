import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Headphones, Keyboard, Menu, Mic, MicOff, PhoneOff, RotateCcw, Square, X } from 'lucide-react';
import { Orb } from './Orb';
import { Drawer, type Memory, type Turn } from './Drawer';
import { Subtitles } from './Subtitles';
import { GuidedTour, TOUR_KEY } from './GuidedTour';
import { blobToBase64, loadVoice, prepareReference, saveVoice, type VoiceProfile } from './audio';

type Mode = 'idle' | 'connecting' | 'listening' | 'ready' | 'talking' | 'thinking';
type Answer = { transcript: string; reply: string; sources: string[]; elapsed: number; language: string; voice: string; warning?: string; audio?: string };
function stored<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
function initialMemories(): Memory[] { const saved = stored<Memory[]>('yaad-memories', []); return Array.isArray(saved) ? saved.filter(m => m && typeof m.id==='string' && typeof m.text==='string').slice(-15) : []; }
function initialHistory(): Turn[] { const saved = stored<Turn[]>('yaad-history-v1', []); return Array.isArray(saved) ? saved.filter(t => t && ['user','assistant'].includes(t.role) && typeof t.content==='string').slice(-40) : []; }

export default function App() {
  const [mode, setMode] = useState<Mode>('idle'); const [seconds, setSeconds] = useState(0);
  const [profile, setProfile] = useState<VoiceProfile | null>(null); const [voiceReady, setVoiceReady] = useState(false);
  const [enrollment, setEnrollment] = useState(false); const [consentOpen, setConsentOpen] = useState(false); const [consent, setConsent] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false); const [drawerOpen, setDrawerOpen] = useState(false);
  const [showText, setShowText] = useState(false); const [typed, setTyped] = useState(''); const [storyMode, setStoryMode] = useState(false);
  const [language, setLanguage] = useState(() => stored('yaad-language', 'en-IN'));
  const [subtitles, setSubtitles] = useState(() => stored('yaad-subtitles', true));
  const [handsFree, setHandsFree] = useState(() => stored('yaad-hands-free', true));
  const [muted, setMuted] = useState(false); const [session, setSession] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null); const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(''); const [hasReplyAudio, setHasReplyAudio] = useState(false); const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [memories, setMemories] = useState(initialMemories); const [history, setHistory] = useState(initialHistory);
  const [sessionTurns, setSessionTurns] = useState<Turn[]>([]);
  const [tourStep, setTourStep] = useState<number | null>(() => { if(new URLSearchParams(location.search).get('tour')==='1')return 0; try{return localStorage.getItem(TOUR_KEY)?null:0;}catch{return 0;} });
  const shell = useRef<HTMLElement>(null); const textInput = useRef<HTMLInputElement>(null); const consentDialog = useRef<HTMLDivElement>(null);
  const inputLevel = useRef(0), outputLevel = useRef(0), mutedRef = useRef(false);
  const context = useRef<AudioContext | null>(null); const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null);
  const analyser = useRef<AnalyserNode | null>(null); const source = useRef<AudioNode | null>(null);
  const replyBuffer = useRef<AudioBuffer | null>(null); const replySource = useRef<AudioBufferSourceNode | null>(null);
  const replyOffset = useRef(0), replyStartedAt = useRef(0), frame = useRef(0), recordingGeneration = useRef(0);
  const recordingKind = useRef<'voice' | 'message'>('message'); const currentUrl = useRef('');
  const request = useRef<AbortController | null>(null); const auto = useRef(false); const discardRecording = useRef(false);
  const restartTimer = useRef<number | undefined>(undefined);
  const recordRef = useRef<(automatic?: boolean, capture?: boolean) => Promise<void>>(async()=>{});
  const converseRef = useRef<(blob?: Blob, text?: string) => Promise<void>>(async()=>{});
  const capturing = voiceReady && (!profile || enrollment);
  const busy = mode==='thinking' || mode==='connecting';

  useEffect(() => { let mounted=true; void loadVoice().then(saved=>{if(mounted)setProfile(saved);}).catch(()=>{}).finally(()=>{if(mounted)setVoiceReady(true);});return()=>{mounted=false;}; }, []);
  useEffect(() => { try { localStorage.setItem('yaad-memories',JSON.stringify(memories)); localStorage.setItem('yaad-history-v1',JSON.stringify(history)); } catch { setError('Browser storage is unavailable. Keep this tab open.'); } }, [memories,history]);
  useEffect(() => { try { localStorage.setItem('yaad-language',JSON.stringify(language));localStorage.setItem('yaad-subtitles',JSON.stringify(subtitles));localStorage.setItem('yaad-hands-free',JSON.stringify(handsFree)); }catch{} }, [language,subtitles,handsFree]);
  useEffect(() => { if(!notice)return;const timer=setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(timer); }, [notice]);
  useLayoutEffect(() => {
    const measure=()=>{const view=window.visualViewport;shell.current?.style.setProperty('--viewport-height',`${view?.height || innerHeight}px`);shell.current?.style.setProperty('--viewport-top',`${view?.offsetTop || 0}px`);};
    measure();window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);window.visualViewport?.addEventListener('scroll',measure);
    return()=>{window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('scroll',measure);};
  }, []);
  useEffect(() => { if(showText)requestAnimationFrame(()=>textInput.current?.focus({preventScroll:true})); }, [showText]);
  useEffect(() => { if(consentOpen)requestAnimationFrame(()=>consentDialog.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true})); }, [consentOpen]);
  useEffect(() => { const url=new URL(location.href); if(url.pathname==='/memories'||url.pathname==='/conversation'){url.pathname='/';window.history.replaceState(null,'',url);} }, []);

  function stopMeter() { cancelAnimationFrame(frame.current);source.current?.disconnect();source.current=null;analyser.current?.disconnect();analyser.current=null;inputLevel.current=0;outputLevel.current=0; }
  function stopReply(pause=false) {
    if(pause&&replySource.current&&context.current)replyOffset.current+=context.current.currentTime-replyStartedAt.current;else if(!pause)replyOffset.current=0;
    if(replySource.current){replySource.current.onended=null;replySource.current.stop();replySource.current.disconnect();replySource.current=null;}stopMeter();
  }
  function endSession(cancelRequest=false) {
    recordingGeneration.current++;auto.current=false;setSession(false);window.clearTimeout(restartTimer.current);
    if(recorder.current&&['recording','paused'].includes(recorder.current.state)){discardRecording.current=true;recorder.current.stop();}
    if(cancelRequest){request.current?.abort();stopReply();setMode(replyBuffer.current?'ready':'idle');}
  }
  function newSession() { endSession(true);setSessionTurns([]);setAnswer(null);setHasReplyAudio(false);replyBuffer.current=null;if(currentUrl.current){URL.revokeObjectURL(currentUrl.current);currentUrl.current='';}setAudioUrl('');setShowText(false);setTyped('');setStoryMode(false);setEnrollment(false);setConsentOpen(false);setError('');setNotice('New conversation. Your saved voice is unchanged.'); }
  function openDrawer() { endSession(true);setShowText(false);setDrawerOpen(true); }
  function beginEnrollment() { endSession(true);setDrawerOpen(false);setShowText(false);setStoryMode(false);setConsent(false);setConsentOpen(true); }
  function finishTour() {try{localStorage.setItem(TOUR_KEY,'seen');}catch{}const url=new URL(location.href);url.searchParams.delete('tour');window.history.replaceState(null,'',url);setTourStep(null);}
  async function keepVoice(blob:Blob,generation:number) {
    setSavingVoice(true);setMode('thinking');
    try{const reference=await prepareReference(blob);if(generation!==recordingGeneration.current)return;
      const next:VoiceProfile={id:crypto.randomUUID(),name:'Saved voice',...reference,consent:true};await saveVoice(next);if(generation!==recordingGeneration.current)return;
      stopReply();replyBuffer.current=null;setHasReplyAudio(false);setProfile(next);setEnrollment(false);setConsent(false);setAnswer(null);setMode('idle');setNotice('Voice saved. Tap the orb to ask for something.');
    }catch(e){if(generation===recordingGeneration.current){setMode('idle');setError(e instanceof Error?e.message:'Could not save the voice. Try again.');}}finally{setSavingVoice(false);}
  }
  async function getContext(){if(!context.current||context.current.state==='closed')context.current=new AudioContext();await context.current.resume();return context.current;}
  function meter(node:AudioNode,ctx:AudioContext,output:boolean){
    stopMeter();const a=ctx.createAnalyser();a.fftSize=512;a.smoothingTimeConstant=.75;node.connect(a);if(output)a.connect(ctx.destination);source.current=node;analyser.current=a;
    const values=new Uint8Array(a.fftSize);let started=performance.now(),lastSpeech=started,heardSpeech=false;
    const tick=()=>{a.getByteTimeDomainData(values);const rms=Math.sqrt(values.reduce((sum,v)=>sum+((v-128)/128)**2,0)/values.length);const level=output?outputLevel:inputLevel;level.current+=(Math.min(1,rms*5)-level.current)*.35;
      if(!output&&auto.current&&recorder.current){const now=performance.now();if(mutedRef.current){started=now;lastSpeech=now;heardSpeech=false;}
        else if(recorder.current.state==='recording'){if(rms>.018){lastSpeech=now;heardSpeech=true;}if(heardSpeech&&now-lastSpeech>1800&&now-started>2000){recorder.current.stop();return;}if(!heardSpeech&&now-started>12000){endSession();setMode('idle');setNotice('Tap the orb when you’re ready.');return;}}}
      frame.current=requestAnimationFrame(tick);};tick();
  }
  function startReply(ctx:AudioContext){if(!replyBuffer.current)return;const node=ctx.createBufferSource();node.buffer=replyBuffer.current;if(replyOffset.current>=node.buffer.duration)replyOffset.current=0;
    meter(node,ctx,true);replySource.current=node;replyStartedAt.current=ctx.currentTime;node.onended=()=>{replySource.current=null;replyOffset.current=0;stopMeter();setMode('ready');if(auto.current)restartTimer.current=window.setTimeout(()=>{if(auto.current)void recordRef.current(true);},450);};node.start(0,replyOffset.current);setPlaybackBlocked(false);
  }
  const playbackTime=useCallback(()=>replyOffset.current+(replySource.current&&context.current?context.current.currentTime-replyStartedAt.current:0),[]);
  async function converse(blob?:Blob,text?:string,override?:'record'|'chat'){
    request.current?.abort();const controller=new AbortController();request.current=controller;stopReply();replyBuffer.current=null;setPlaybackBlocked(false);setHasReplyAudio(false);setMode('thinking');setError('');setAnswer(null);setNotice('');setShowText(false);
    const task=override||(storyMode?'record':'chat');const chosen=profile;
    if(!chosen){setMode('idle');setError('Tap the orb to preserve a voice first.');return;}
    const timer=window.setTimeout(()=>controller.abort('timeout'),120000);
    try{await getContext();const encoded=blob?await blobToBase64(blob):undefined;
      const response=await fetch('/api/converse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio:encoded,mime:blob?.type,text,mode:task,language,memories,history:sessionTurns,voice:{audio:chosen.audio,name:chosen.name,consent:chosen.consent}}),signal:controller.signal});
      const result:Answer&{error?:string}=await response.json();if(!response.ok)throw new Error(result.error||'Could not complete this request. Please try again.');if(controller.signal.aborted)return;
      const {audio,...view}=result;setAnswer(view);setTyped('');const createdAt=new Date().toISOString();
      if(task==='record'){setMemories(previous=>[...previous,{id:crypto.randomUUID(),text:result.transcript,createdAt}].slice(-15));setStoryMode(false);}
      else{const turns:Turn[]=[{role:'user',content:result.transcript,createdAt},{role:'assistant',content:result.reply,createdAt,sources:result.sources}];setSessionTurns(previous=>[...previous,...turns].slice(-8));setHistory(previous=>[...previous,...turns].slice(-40));}
      if(result.warning)setError('Speech is unavailable. Open History to read the reply, or try again.');
      if(audio){const bytes=Uint8Array.from(atob(audio),c=>c.charCodeAt(0));const buffer=await(await getContext()).decodeAudioData(bytes.buffer.slice(0));if(controller.signal.aborted)return;
        if(currentUrl.current)URL.revokeObjectURL(currentUrl.current);currentUrl.current=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));setAudioUrl(currentUrl.current);replyBuffer.current=buffer;setDuration(buffer.duration);setHasReplyAudio(true);
        try{startReply(await getContext());setMode('talking');}catch{endSession();setMode('ready');setPlaybackBlocked(true);}
      }else{endSession();setMode('ready');}
    }catch(e){if(controller.signal.aborted&&controller.signal.reason!=='timeout')return;endSession();setMode('ready');setError(controller.signal.reason==='timeout'?'This took too long. Try a shorter request.':e instanceof Error?e.message:'Couldn’t reach Sarvam. Try again.');}
    finally{clearTimeout(timer);if(request.current===controller)request.current=null;}
  }
  converseRef.current=converse;
  async function record(automatic=false,capture=false){
    setShowText(false);setError('');setNotice('');if(capture&&!consent){beginEnrollment();return;}const generation=++recordingGeneration.current;recordingKind.current=capture?'voice':'message';
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){endSession();setError('Recording needs HTTPS or localhost and microphone support.');return;}
    stopReply();setMode('connecting');discardRecording.current=false;if(automatic){auto.current=true;setSession(true);}
    try{const ctx=await getContext();const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      if(generation!==recordingGeneration.current||(automatic&&!auto.current)){s.getTracks().forEach(t=>t.stop());return;}stream.current=s;
      const mimeType=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));const r=new MediaRecorder(s,mimeType?{mimeType}:undefined);const chunks:Blob[]=[];
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};r.onstop=()=>{s.getTracks().forEach(t=>t.stop());if(stream.current===s)stream.current=null;if(discardRecording.current||generation!==recordingGeneration.current)return;stopMeter();
        if(chunks.length){const blob=new Blob(chunks,{type:r.mimeType});if(capture)void keepVoice(blob,generation);else void converseRef.current(blob);}else{endSession();setMode('idle');setError('No audio was captured. Try again.');}};
      recorder.current=r;setSeconds(0);r.start(250);if(!capture&&mutedRef.current){s.getAudioTracks().forEach(t=>{t.enabled=false;});r.pause();}meter(ctx.createMediaStreamSource(s),ctx,false);setMode('listening');
    }catch(e){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;stopMeter();endSession();setMode('idle');setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Allow microphone access in your browser to record this voice.':'Couldn’t start the microphone. Try again.');}
  }
  recordRef.current=record;
  function orbAction(){
    if(!voiceReady||savingVoice||busy)return;
    if(mode==='listening'){if(recorder.current&&['recording','paused'].includes(recorder.current.state))recorder.current.stop();return;}
    if(mode==='talking'){stopReply(true);setMode('ready');return;}
    if(capturing){beginEnrollment();return;}
    if(replyBuffer.current&&replyOffset.current>0){void play();return;}
    void record(handsFree&&!storyMode);
  }
  function sessionAction(){if(capturing&&mode==='listening'){recorder.current?.stop();return;}if(session||busy||mode==='talking'||mode==='listening'){endSession(true);return;}orbAction();}
  function toggleMute(){const next=!mutedRef.current;mutedRef.current=next;setMuted(next);stream.current?.getAudioTracks().forEach(track=>{track.enabled=!next;});if(next&&recorder.current?.state==='recording')recorder.current.pause();else if(!next&&recorder.current?.state==='paused')recorder.current.resume();}
  function openText(){endSession(true);setError('');setShowText(value=>!value);}
  function sendText(text:string){if(!text.trim()||busy)return;if(!profile){setShowText(false);beginEnrollment();return;}endSession();void converse(undefined,text.trim());}
  async function play(){endSession();setError('');if(!replyBuffer.current)return;if(mode==='talking'){stopReply(true);setMode('ready');return;}try{startReply(await getContext());setMode('talking');}catch{setPlaybackBlocked(true);setMode('ready');setError('Could not start playback. Check device audio and try again.');}}
  useEffect(()=>{if(mode!=='listening'||muted)return;const timer=window.setInterval(()=>setSeconds(value=>value+1),1000);return()=>clearInterval(timer);},[mode,muted]);
  useEffect(()=>{if(mode==='listening'&&seconds>=(recordingKind.current==='voice'?12:25)&&recorder.current&&['recording','paused'].includes(recorder.current.state))recorder.current.stop();},[mode,seconds]);
  useEffect(()=>{const hidden=()=>{if(document.hidden)endSession(true);};document.addEventListener('visibilitychange',hidden);return()=>document.removeEventListener('visibilitychange',hidden);},[]);
  useEffect(()=>()=>{auto.current=false;window.clearTimeout(restartTimer.current);request.current?.abort();if(recorder.current&&['recording','paused'].includes(recorder.current.state)){recorder.current.onstop=null;recorder.current.stop();}stream.current?.getTracks().forEach(t=>t.stop());cancelAnimationFrame(frame.current);source.current?.disconnect();if(replySource.current){replySource.current.onended=null;replySource.current.stop();}void context.current?.close();if(currentUrl.current)URL.revokeObjectURL(currentUrl.current);},[]);

  const status=savingVoice?'Saving voice':mode==='thinking'?'Thinking':mode==='connecting'?'Connecting':mode==='listening'?muted?'Mic muted':'Listening':mode==='talking'?'Speaking':'Ready';
  const orbLabel=mode==='listening'?capturing?'Stop and save voice':'Send voice message':mode==='talking'?'Pause reply':capturing?'Record and save voice':replyOffset.current>0?'Resume reply':'Start conversation';
  const hint=mode==='listening'?muted?'Unmute to keep talking':capturing?`Speak naturally · ${seconds}s · tap to save`:session?'Pause to send · tap to send now':'Tap the orb to send':mode==='thinking'||mode==='connecting'?'':mode==='talking'?'':capturing?'Tap to preserve a voice':replyOffset.current>0?'Tap to resume':'Tap to speak';
  const primaryLabel=capturing&&mode==='listening'?'Save voice':session||busy||mode==='talking'||mode==='listening'?'End session':capturing?'Record voice':'Start conversation';
  return <main ref={shell} className={`orb-app ${showText?'has-keyboard':''}`}>
    <header className="topbar" inert={drawerOpen||consentOpen}><button data-tour="menu" className="top-menu icon-button" aria-label="Open menu" aria-expanded={drawerOpen} onClick={openDrawer}><Menu size={24} strokeWidth={1.5}/></button><div className={`system-status ${mode==='talking'||mode==='listening'||busy?'active':''}`} role="status"><span/>{status}</div></header>
    <section className="voice-stage" inert={drawerOpen||consentOpen} aria-label="Voice conversation"><h1 className="orb-brand">yaad<span>.</span></h1><div className={`orb-stage ${mode==='listening'||mode==='talking'?'is-active':''}`}><div className="orb-aura"/><div className="orb-visual" aria-hidden="true"><Suspense fallback={<div className="orb-loading"/>}><Orb className="orb-canvas" colors={['#eef0f3','#bac2cc']} seed={73} agentState={mode==='thinking'?'thinking':mode==='listening'?'listening':mode==='talking'?'talking':null} volumeMode={mode==='thinking'?'auto':'manual'} inputVolumeRef={inputLevel} outputVolumeRef={outputLevel}/></Suspense></div><div className="orb-shadow"/><button data-tour="record" className={`orb-touch ${mode==='listening'?'is-recording':''}`} aria-label={orbLabel} disabled={!voiceReady||busy} onClick={orbAction}/></div>
      <div className="below-orb">{mode==='talking'&&subtitles&&answer&&duration>0?<Subtitles key={`${answer.reply}-${duration}`} text={answer.reply} duration={duration} getTime={playbackTime}/>:<p className="orb-hint">{notice||(!voiceReady?'Loading your voice…':storyMode&&mode==='idle'?'Tap to tell a story':hint)}</p>}{playbackBlocked&&hasReplyAudio&&<button className="play-fallback" onClick={()=>void play()}><Headphones size={15}/>Play reply</button>}</div>
    </section>
    {error&&<div className="error-toast glass-panel" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss message" onClick={()=>setError('')}><X size={16}/></button></div>}
    <div className="dock-zone" inert={drawerOpen||consentOpen}><nav data-tour="dock" className="bottom-dock glass-panel" aria-label="Session controls"><button aria-label={muted?'Unmute microphone':'Mute microphone'} aria-pressed={muted} disabled={capturing||savingVoice} onClick={toggleMute}>{muted?<MicOff size={20} strokeWidth={1.5}/>:<Mic size={20} strokeWidth={1.5}/>}</button><button className={`session-control ${session||mode==='listening'?'session-live':''}`} aria-label={primaryLabel} disabled={!voiceReady||savingVoice} onClick={sessionAction}>{capturing&&mode==='listening'?<Square size={17} fill="currentColor"/>:session||mode==='talking'||busy||mode==='listening'?<PhoneOff size={21} strokeWidth={1.6}/>:<Mic size={23} strokeWidth={1.6}/>}</button><button aria-label={showText?'Close text input':'Type instead'} aria-expanded={showText} disabled={!profile||savingVoice} onClick={openText}>{showText?<X size={20}/>:<Keyboard size={21} strokeWidth={1.5}/>}</button><button aria-label="New session" disabled={savingVoice} onClick={newSession}><RotateCcw size={19} strokeWidth={1.5}/></button></nav></div>
    {showText&&<div className="keyboard-layer" inert={drawerOpen||consentOpen}><form className="keyboard-sheet glass-panel" role="dialog" aria-modal="false" aria-label="Type a message" onSubmit={e=>{e.preventDefault();sendText(typed);}}><input ref={textInput} aria-label="Type a memory or question" value={typed} maxLength={3000} onChange={e=>setTyped(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setShowText(false);}} placeholder={storyMode?'Tell a little story…':'What would you like to hear?'} disabled={busy}/><button aria-label="Send message" disabled={!typed.trim()||busy}><ArrowRight size={20}/></button></form></div>}
    <Drawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} profile={profile} history={history} memories={memories} language={language} onLanguage={setLanguage} subtitles={subtitles} onSubtitles={setSubtitles} handsFree={handsFree} onHandsFree={setHandsFree} onRecord={beginEnrollment} onRename={async name=>{if(!profile)return;const next={...profile,name};await saveVoice(next);setProfile(next);}} onDeleteVoice={async()=>{await saveVoice(null);newSession();setProfile(null);}} onClearHistory={()=>{newSession();setHistory([]);}} onClearMemories={()=>setMemories([])} onStory={()=>{setDrawerOpen(false);endSession(true);setStoryMode(true);setNotice('Tap the orb to tell a story.');}} onPoem={()=>{setDrawerOpen(false);setStoryMode(false);endSession();void converse(undefined,'Recite the first verse of the public-domain poem Twinkle, Twinkle, Little Star. Return only the poem, without an introduction.','chat');}} onGuide={()=>{setDrawerOpen(false);setTourStep(0);}} audioUrl={hasReplyAudio?audioUrl:''} onReplay={()=>{setDrawerOpen(false);void play();}}/>
    {consentOpen&&<div className="consent-layer" onKeyDown={e=>{if(e.key==='Escape')setConsentOpen(false);if(e.key==='Tab'){const nodes=Array.from(consentDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input')||[]);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><div ref={consentDialog} className="consent-sheet glass-panel" role="dialog" aria-modal="true" aria-labelledby="consent-title"><button className="consent-close icon-button" aria-label="Close voice recording setup" onClick={()=>setConsentOpen(false)}><X size={20}/></button><h2 id="consent-title">Keep this voice.</h2><p>Speak clearly for 10–12 seconds. The orb will keep this recording for new AI-generated speech.</p><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I have permission and the rights to use this voice.</span></label><button className="primary-action" disabled={!consent} onClick={()=>{setConsentOpen(false);setEnrollment(true);mutedRef.current=false;setMuted(false);void record(false,true);}}>Record with the orb</button><small>Saved in this browser. Sent to Sarvam when generating speech. New questions never replace it.</small></div></div>}
    {tourStep!==null&&<GuidedTour step={tourStep} mode={mode} layoutKey={`${mode}-${drawerOpen}`} onStep={setTourStep} onClose={finishTour}/>}
  </main>;
}
