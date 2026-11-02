import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Headphones, Mic, MessageCircle, X } from 'lucide-react';
import './tour.css';
import { ButtonWithIcon, IconButton } from './components/ui/button-witn-icon';

export const TOUR_KEY = 'yaad-guided-tour-v4';

const steps = [
  { target: null, icon: MessageCircle, label: 'WELCOME TO YAAD', title: 'One orb.\nYour voice.', text: 'Keep a voice once, then have a conversation or hear something new in that same voice.', hint: 'Your voice stays in this browser. New questions never replace it.' },
  { target: 'record', icon: Mic, label: 'TAP THE ORB', title: 'Record, then talk.', text: 'Tap the orb to preserve a voice. Confirm permission, then speak for 10–12 seconds. Once saved, the same orb starts a conversation.', hint: 'The orb reacts when you speak and when it replies.' },
  { target: 'dock', icon: Headphones, label: 'ALWAYS WITHIN REACH', title: 'Controls stay at the bottom.', text: 'Keep a voice, then tap Talk to begin. End your conversation from the same button. Mute appears during a conversation. Typing, a fresh session, history, and settings live in the top-right menu.', hint: 'Replies are spoken. Optional subtitles follow audio playback.' },
];

type Rect = { left: number; top: number; width: number; height: number };
type Props = { step: number; mode: string; layoutKey: string; onStep: (step: number) => void; onClose: () => void };

export function GuidedTour({ step, mode, layoutKey, onStep, onClose }: Props) {
  const entry = steps[step];
  const Icon = entry.icon;
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [panelSize, setPanelSize] = useState({width: 360, height: 330});
  const [viewport, setViewport] = useState({width: innerWidth, height: innerHeight, top: 0});
  const previousFocus = useRef<HTMLElement | null>(null);
  const isRecording = step === 1 && mode === 'listening';
  const isProcessing = step === 1 && (mode === 'thinking' || mode === 'connecting');

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
  const stepTitle = entry.title;
  const stepText = entry.text;

  return <div className={`tour-layer ${rect ? 'tour-anchored' : 'tour-centered'}`}>
    {rect ? <>
      <div className="tour-spotlight" style={{left:rect.left,top:rect.top,width:rect.width,height:rect.height}}/>
      <div className="tour-blocker" style={{left:0,top:0,width:'100%',height:rect.top}}/>
      <div className="tour-blocker" style={{left:0,top:rect.top+rect.height,width:'100%',bottom:0}}/>
      <div className="tour-blocker" style={{left:0,top:rect.top,width:rect.left,height:rect.height}}/>
      <div className="tour-blocker" style={{left:rect.left+rect.width,top:rect.top,right:0,height:rect.height}}/>
    </> : <div className="tour-scrim"/>}
    <div ref={panel} className={`tour-card tour-${placement} ${step===1 && layoutKey.startsWith('language-') ? 'tour-language-open' : ''}`} role="dialog" aria-modal={!rect} aria-labelledby="tour-title" aria-describedby="tour-description" style={{left:placement==='side-left' ? rect!.left-width-16 : left,top,width,maxHeight:viewport.height-edge*2}}>
      <div className="tour-card-header"><span className="tour-brand">yaad<span>.</span><span className="tour-guide-label">YOUR GUIDE</span></span><IconButton className="tour-close" aria-label="Close tutorial" onClick={onClose}><X size={17}/></IconButton></div>
      <div className="tour-copy" key={`${step}-${isRecording}-${isProcessing}`}>
        <div className="tour-step-icon"><Icon size={23} strokeWidth={1.5}/></div>
        <div className="tour-label">{entry.label}</div>
        <h2 id="tour-title" tabIndex={-1} ref={heading}>{stepTitle}</h2>
        <p id="tour-description">{stepText}</p>
        <div className="tour-note">{entry.hint}</div>
      </div>
      <div className="tour-footer"><div className="tour-progress" aria-label={`Step ${step+1} of ${steps.length}`}>{steps.map((_,i) => <span key={i} className={i===step ? 'current' : i<step ? 'complete' : ''}/>)}</div><span className="tour-count">{step+1} / {steps.length}</span></div>
      <div className="tour-actions">
        {step > 0 ? <ButtonWithIcon variant="secondary" size="sm" icon={<ArrowLeft size={14}/>} className="tour-back" disabled={isRecording || isProcessing} onClick={() => onStep(step-1)}>Back</ButtonWithIcon> : <ButtonWithIcon variant="secondary" size="sm" className="tour-back" onClick={onClose}>Skip guide</ButtonWithIcon>}
        <ButtonWithIcon size="sm" icon={<ArrowRight size={15}/>} className="tour-next" disabled={isRecording || isProcessing} onClick={() => step === steps.length-1 ? onClose() : onStep(step+1)}>{step===0 ? 'Show me around' : step===steps.length-1 ? 'Start' : 'Next'}</ButtonWithIcon>
      </div>

    </div>
  </div>;
}
