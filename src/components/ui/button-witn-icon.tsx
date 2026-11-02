import * as React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Button, type ButtonProps } from './button';
import { cn } from '@/lib/utils';

export function ButtonIcon({ children, rotate = false }: { children: React.ReactNode; rotate?: boolean }) {
  return <span className="button-icon-disc" aria-hidden="true"><span className={cn('button-icon-glyph', !rotate && 'keep-icon-upright')}>{children}</span></span>;
}
export interface ButtonWithIconProps extends ButtonProps { icon?: React.ReactNode; rotateIcon?: boolean }
export const ButtonWithIcon = React.forwardRef<HTMLButtonElement, ButtonWithIconProps>(({ children, icon, rotateIcon, className, size, asChild, ...props }, ref) => {
  const body = (label: React.ReactNode) => <><span className="button-label">{label}</span><ButtonIcon rotate={rotateIcon ?? !icon}>{icon || <ArrowUpRight size={16}/>}</ButtonIcon></>;
  const classes = cn('yaad-action yaad-action-label', size === 'sm' && 'yaad-action-small', className);
  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement<{ children?: React.ReactNode }>;
    return <Button ref={ref} asChild size={size} className={classes} {...props}>{React.cloneElement(child, {}, body(child.props.children))}</Button>;
  }
  return <Button ref={ref} size={size} className={classes} {...props}>{body(children)}</Button>;
});
ButtonWithIcon.displayName = 'ButtonWithIcon';
export const IconButton = React.forwardRef<HTMLButtonElement, ButtonProps>(({ children, className, ...props }, ref) => <Button ref={ref} variant="secondary" size="icon" className={cn('yaad-action yaad-icon', className)} {...props}><ButtonIcon>{children}</ButtonIcon></Button>);
IconButton.displayName = 'IconButton';
export default ButtonWithIcon;
