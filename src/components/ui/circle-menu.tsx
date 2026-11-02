import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '../../utils';
import './circle-menu.css';

export type CircleMenuItem = {
  id: string;
  label: string;
  accessibleLabel?: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};

type Props = { items: CircleMenuItem[]; open: boolean; onClose: () => void };
const pointOnCircle = (index: number, total: number, radius: number) => {
  const angle = 2 * Math.PI * index / total - Math.PI / 2;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
};

// Adapted from the supplied circle-menu reference: spring positioning, staggered
// items, a morphing Menu/X trigger, and a rotating collapse. Uses Yaad's CSS
// theme instead of requiring a Tailwind or shadcn migration.
export function CircleMenu({ items, open, onClose }: Props) {
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [radius, setRadius] = useState(110);
  const ring = useAnimationControls(); const trigger = useAnimationControls();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const closeVersion = useRef(0); const closingRef = useRef(false); const mounted = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; closeVersion.current++; }; }, []);
  useLayoutEffect(() => {
    const resize = () => {
      const view = window.visualViewport;
      const width = Math.min(innerWidth, view?.width || innerWidth);
      const height = Math.min(innerHeight, view?.height || innerHeight);
      setRadius(Math.max(64, Math.min(125, (width - 112) / 2, (height - 148) / 2)));
    };
    resize(); window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => {
    closeVersion.current++;
    if (open) {
      closingRef.current = false; setClosing(false); setOpening(true); ring.set({ rotate: 0, filter: 'blur(0px)' }); trigger.set({ scale: 1 }); setExpanded(true);
      const frame = requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
  }, [open, ring, trigger]);

  async function collapse(action: () => void) {
    if (closingRef.current) return;
    closingRef.current = true; setClosing(true); setExpanded(false);
    const version = ++closeVersion.current;
    if (!reduced) {
      await Promise.all([
        ring.start({ rotate: -360, filter: 'blur(1px)', transition: { duration: .55, ease: [.4, 0, .2, 1] } }),
        trigger.start({ scale: [1, 1.14, 1], transition: { duration: .5, times: [0, .45, 1], ease: 'easeInOut' } }),
      ]);
    }
    if (mounted.current && closeVersion.current === version) action();
  }
  function moveFocus(index: number, direction: number) {
    for (let offset = 1; offset <= items.length; offset++) {
      const next = (index + direction * offset + items.length) % items.length;
      if (!items[next].disabled) { itemRefs.current[next]?.focus(); break; }
    }
  }

  return <div className={cn('circle-menu-shell', closing && 'is-closing', opening && 'is-opening')} style={{ '--circle-radius': `${radius}px` } as CSSProperties} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void collapse(onClose); }
  }}>
    <motion.button ref={triggerRef} className="circle-menu-trigger" aria-label="Close menu" aria-expanded={expanded} aria-controls="circle-menu-actions" disabled={closing || opening} animate={trigger} onClick={() => void collapse(onClose)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={expanded ? 'close' : 'open'} initial={{ opacity: 0, filter: reduced ? 'none' : 'blur(6px)', rotate: -45 }} animate={{ opacity: 1, filter: 'blur(0px)', rotate: 0 }} exit={{ opacity: 0, filter: reduced ? 'none' : 'blur(6px)', rotate: 45 }} transition={{ duration: reduced ? 0 : .16 }}>
          {expanded ? <X size={21} strokeWidth={1.5}/> : <Menu size={20} strokeWidth={1.5}/>}
        </motion.span>
      </AnimatePresence>
    </motion.button>
    <motion.div id="circle-menu-actions" className="circle-menu-ring" role="group" aria-label="Yaad shortcuts" animate={ring} initial={{ rotate: 0 }}>
      {items.map((item, index) => {
        const point = pointOnCircle(index, items.length, radius);
        return <motion.button key={item.id} ref={node => { itemRefs.current[index] = node; }} type="button" className="circle-menu-item" data-upper={point.y < -1} aria-label={item.accessibleLabel || item.label} disabled={item.disabled || closing || opening || !expanded} tabIndex={expanded && !closing && !opening && !item.disabled ? 0 : -1} initial={{ x: 0, y: 0, scale: .45, opacity: 0 }} animate={expanded ? { ...point, scale: 1, opacity: item.disabled ? .35 : 1 } : { x: 0, y: 0, scale: .45, opacity: 0 }} transition={reduced ? { duration: 0 } : { delay: expanded ? index * .025 : (items.length - index - 1) * .03, type: 'spring', stiffness: 300, damping: 28 }} onAnimationComplete={definition => { if (index === items.length - 1 && expanded && typeof definition === 'object' && !Array.isArray(definition) && definition.scale === 1) setOpening(false); }} whileHover={reduced ? {} : { scale: 1.08, transition: { duration: .15, delay: 0 } }} whileTap={reduced ? {} : { scale: .94 }} onClick={() => void collapse(item.onSelect)} onKeyDown={event => {
          if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); moveFocus(index, ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1); }
          else if (event.key === 'Home') { event.preventDefault(); itemRefs.current.find(node => node && !node.disabled)?.focus(); }
          else if (event.key === 'End') { event.preventDefault(); [...itemRefs.current].reverse().find(node => node && !node.disabled)?.focus(); }
        }}>
          <span className="circle-menu-icon" aria-hidden="true">{item.icon}</span>
          <span className="circle-menu-label">{item.label}</span>
        </motion.button>;
      })}
    </motion.div>
  </div>;
}
