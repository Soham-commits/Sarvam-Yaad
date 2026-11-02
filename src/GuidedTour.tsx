import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Globe2, Headphones, Mic, Play, Quote, MessageCircle, X } from 'lucide-react';
import './tour.css';

export const TOUR_KEY = 'yaad-guided-tour-v2';
export const SAMPLE_MEMORY = 'Demo memory: When I was eight, my grandfather taught me to ride a bicycle in Pune. We celebrated with mango ice cream.';

const steps = [
  { target: null, icon: MessageCircle, label: 'A LITTLE INTRODUCTION', title: 'A story today.\nA memory to return to.', text: 'Welcome to Yaad. Keep stories on the Memories page. Visit Conversation to talk, ask about them, or hear a poem in your chosen voice.', hint: 'A quick, guided tour · About a minute' },
  { target: 'language', icon: Globe2, label: 'MAKE IT YOURS', title: 'Choose what you’d like to hear.', text: 'Tap this selector to choose a reply language. You can speak in another supported language—Yaad detects your speech automatically.', hint: 'Try English, हिन्दी, मराठी, or one of 8 more.' },
  { target: 'record-mode', icon: BookOpen, label: 'FIRST, SAVE A STORY', title: 'Your stories have a room.', text: 'Open Memories to save what you share as a story. Pick one small event with a person, a place, and a detail you can ask about later.', hint: 'Tap Memories, or choose Next to keep looking around.' },
  { target: 'record', icon: Mic, label: 'YOUR VOICE IS THE START', title: 'Tap. Speak. Tap to finish.', text: 'On Memories, tap the microphone and allow access. Speak for 10–20 seconds, then tap the square to stop. Yaad saves the transcript and asks a spoken follow-up.', hint: 'Prefer typing? Finish the tour and try our labelled example.' },
  { target: 'playback', icon: Headphones, label: 'LISTEN BACK', title: 'The answer has a voice.', text: 'After processing, the orb moves with the spoken reply. If your browser blocks automatic sound, tap headphones or “Play answer”.', hint: 'Use the voice pill to select the narrator or add a permitted voice reference.' },
  { target: 'ask-mode', icon: Quote, label: 'NOW, EXPLORE YOUR CAPSULE', title: 'Ask about what you saved.', text: 'Open Conversation. Tap the mic once for hands-free conversation, or use the keyboard to ask a question. For the sample story, ask: “Who taught me to ride a bicycle, and where?”', hint: 'Poems and conversation work immediately. Personal answers need saved stories.' },
  { target: 'evidence', icon: Check, label: 'SEE WHAT THE ANSWER COMES FROM', title: 'A memory you can check.', text: 'A supported answer includes “Original memory”. Expand it to inspect the saved transcript. Ask about a detail you never recorded: Yaad should acknowledge the gap.', hint: 'Memories stay in this browser. A different device starts a separate capsule.' },
  { target: null, icon: Play, label: 'YOUR FIRST TEST', title: 'Try a little memory.', text: 'We can place a clearly labelled example in the typing box. Press Send to save it and hear a follow-up. Then visit Conversation and ask who taught you to ride a bicycle.', hint: 'You can replay this tour any time from the ••• menu.' },
];

type Rect = { left: number; top: number; width: number; height: number };
type Props = { step: number; mode: string; error: string; layoutKey: string; onStep: (step: number) => void; onClose: () => void; onExample: () => void };

export function GuidedTour({ step, mode, error, layoutKey, onStep, onClose, onExample }: Props) {
  const entry = steps[step];
  const Icon = entry.icon;
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [panelSize, setPanelSize] = useState({width: 360, height: 330});
  const [viewport, setViewport] = useState({width: innerWidth, height: innerHeight, top: 0});
  const previousFocus = useRef<HTMLElement | null>(null);
  const isRecording = step === 3 && mode === 'listening';
  const isProcessing = step === 3 && (mode === 'thinking' || mode === 'connecting');

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previousFocus.current?.focus({preventScroll:true}); };
  }, []);

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const v = window.visualViewport;
        const nextView = {width: v?.width || innerWidth, height: v?.height || innerHeight, top: v?.offsetTop || 0};
        setViewport(nextView);
        const target = entry.target ? document.querySelector<HTMLElement>(`[data-tour="${entry.target}"]`) : null;
        if (!target) { setRect(null); return; }
        let bounds = target.getBoundingClientRect();
        const menu = target.querySelector<HTMLElement>('.popover');
        if (menu) {
          const m = menu.getBoundingClientRect();
          bounds = new DOMRect(Math.min(bounds.left,m.left), Math.min(bounds.top,m.top), Math.max(bounds.right,m.right)-Math.min(bounds.left,m.left), Math.max(bounds.bottom,m.bottom)-Math.min(bounds.top,m.top));
        }
        const left = Math.max(8,bounds.left-8), top = Math.max(nextView.top+8,bounds.top-8);
        const right = Math.min(nextView.width-8,bounds.right+8), bottom = Math.min(nextView.top+nextView.height-8,bounds.bottom+8);
        setRect({left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)});
      });
    };
    measure();
    const target = entry.target ? document.querySelector<HTMLElement>(`[data-tour="${entry.target}"]`) : null;
    const observer = new ResizeObserver(measure);
    if (target) observer.observe(target);
    if (target?.querySelector('.popover')) observer.observe(target.querySelector('.popover')!);
    window.addEventListener('resize',measure);
    window.addEventListener('scroll',measure,true);
    window.visualViewport?.addEventListener('resize',measure);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize',measure); window.removeEventListener('scroll',measure,true); window.visualViewport?.removeEventListener('resize',measure); };
  }, [entry.target,layoutKey]);

  useLayoutEffect(() => {
    const node = panel.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setPanelSize({width:node.offsetWidth,height:node.offsetHeight}));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    heading.current?.focus({preventScroll:true});
    const target = entry.target ? document.querySelector<HTMLElement>(`[data-tour="${entry.target}"]`) : null;
    if (target) {
      const b = target.getBoundingClientRect();
      if (b.top < 0 || b.bottom > innerHeight) target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    }
  }, [step,entry.target]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const target = entry.target ? document.querySelector<HTMLElement>(`[data-tour="${entry.target}"]`) : null;
      const selector = 'button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]';
      const nodes = [...Array.from(panel.current?.querySelectorAll<HTMLElement>(selector) || []), ...(target ? [target,...Array.from(target.querySelectorAll<HTMLElement>(selector))] : [])].filter((node,index,array) => array.indexOf(node) === index && node.matches(selector) && node.getClientRects().length > 0);
      if (!nodes.length) return;
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? nodes.length - 1 : index - 1) : (index + 1) % nodes.length;
      event.preventDefault(); nodes[next].focus();
    };
    document.addEventListener('keydown',handle);
    return () => document.removeEventListener('keydown',handle);
  }, [entry.target,isRecording,isProcessing,onClose]);

  const edge = 16;
  const width = Math.min(360,viewport.width-edge*2);
  const height = Math.min(panelSize.height,viewport.height-edge*2);
  const centered = !rect;
  const left = centered ? (viewport.width-width)/2 : Math.max(edge,Math.min(rect.left+rect.width/2-width/2,viewport.width-width-edge));
  let top = viewport.top+(viewport.height-height)/2;
  let placement = 'center';
  if (rect) {
    const below = viewport.top+viewport.height-(rect.top+rect.height)-edge;
    const above = rect.top-viewport.top-edge;
    if (below >= height+16) { top = rect.top+rect.height+16; placement='below'; }
    else if (above >= height+16) { top=rect.top-height-16; placement='above'; }
    else if (rect.left >= width+edge*2) { top=Math.max(viewport.top+edge,Math.min(rect.top,viewport.top+viewport.height-height-edge)); placement='side-left'; }
    else { top=viewport.top+viewport.height-height-edge; placement='compact'; }
  }
  const stepTitle = isRecording ? 'Now tap the square to finish.' : isProcessing ? 'Your memory is taking shape.' : entry.title;
  const stepText = isRecording ? 'The orb responds to your voice. When you’re ready, tap the highlighted stop button. Your short recording will be sent to Sarvam.' : isProcessing ? 'Wait for transcription and a spoken follow-up. We’ll move to the next step when your memory is ready.' : entry.text;

  return <div className={`tour-layer ${rect ? 'tour-anchored' : 'tour-centered'}`}>
    {rect ? <>
      <div className="tour-spotlight" style={{left:rect.left,top:rect.top,width:rect.width,height:rect.height}}/>
      <div className="tour-blocker" style={{left:0,top:0,width:'100%',height:rect.top}}/>
      <div className="tour-blocker" style={{left:0,top:rect.top+rect.height,width:'100%',bottom:0}}/>
      <div className="tour-blocker" style={{left:0,top:rect.top,width:rect.left,height:rect.height}}/>
      <div className="tour-blocker" style={{left:rect.left+rect.width,top:rect.top,right:0,height:rect.height}}/>
    </> : <div className="tour-scrim"/>}
    <div ref={panel} className={`tour-card tour-${placement} ${step===1 && layoutKey.startsWith('language-') ? 'tour-language-open' : ''}`} role="dialog" aria-modal={!rect} aria-labelledby="tour-title" aria-describedby="tour-description" style={{left:placement==='side-left' ? rect!.left-width-16 : left,top,width,maxHeight:viewport.height-edge*2}}>
      <div className="tour-card-header"><span className="tour-brand">yaad<span>.</span><span className="tour-guide-label">YOUR GUIDE</span></span><button className="tour-close" aria-label="Close tutorial" onClick={onClose}><X size={17}/></button></div>
      <div className="tour-copy" key={`${step}-${isRecording}-${isProcessing}`}>
        <div className="tour-step-icon"><Icon size={23} strokeWidth={1.5}/></div>
        <div className="tour-label">{entry.label}</div>
        <h2 id="tour-title" tabIndex={-1} ref={heading}>{stepTitle}</h2>
        <p id="tour-description">{stepText}</p>
        {step===3 && error && <p className="tour-input-error">{error} You can continue with a typed example below.</p>}
        <div className="tour-note">{step === 7 ? <><strong>Sample story</strong><span>“My grandfather taught me to ride a bicycle in Pune. We celebrated with mango ice cream.”</span></> : entry.hint}</div>
        {step === 6 && <div className="tour-test-note"><span>Try an unknown detail</span>“What was my grandfather’s first salary?”</div>}
      </div>
      <div className="tour-footer"><div className="tour-progress" aria-label={`Step ${step+1} of ${steps.length}`}>{steps.map((_,i) => <span key={i} className={i===step ? 'current' : i<step ? 'complete' : ''}/>)}</div><span className="tour-count">{step+1} / {steps.length}</span></div>
      <div className="tour-actions">
        {step > 0 ? <button className="tour-back" disabled={isRecording || isProcessing} onClick={() => onStep(step-1)}><ArrowLeft size={14}/>Back</button> : <button className="tour-back" onClick={onClose}>Explore on my own</button>}
        <button className="tour-next" disabled={isRecording || isProcessing} onClick={() => step === steps.length-1 || (step===3 && error) ? onExample() : onStep(step+1)}>{step===0 ? 'Show me around' : step===3 && error ? 'Try typed example' : step===steps.length-1 ? 'Try the example' : 'Next'}<ArrowRight size={15}/></button>
      </div>
      {step===steps.length-1 && <button className="tour-own-story" onClick={onClose}>I’ll tell my own story instead</button>}
    </div>
  </div>;
}
