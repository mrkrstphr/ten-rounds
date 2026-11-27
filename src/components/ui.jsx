export function Button({ variant = 'primary', className = '', children, ...props }) {
  const colors = variant === 'primary'
    ? 'button-primary bg-action text-action-ink enabled:hover:bg-action-hover disabled:bg-disabled disabled:text-disabled-ink'
    : 'button-secondary border-control text-accent enabled:hover:bg-subtle disabled:border-strong-line disabled:text-disabled-ink';
  return <button type="button" className={`button inline-flex items-center justify-center gap-[11px] whitespace-nowrap rounded-[5px] border px-3 py-[11px] text-[10px] font-medium transition-[background,transform] enabled:hover:-translate-y-px tablet:gap-2.5 tablet:p-2.5 tablet:text-[9px] wide:gap-[13px] wide:px-[13px] wide:py-[11px] wide:text-[10px] desktop:gap-5 desktop:px-[17px] desktop:py-3 ${variant === 'primary' ? 'border-transparent' : ''} ${colors} ${className}`} {...props}>{children}</button>;
}

export function TextButton({ className = '', children, ...props }) {
  return <button type="button" className={`text-button inline-flex items-center justify-center gap-2 border-0 bg-transparent py-[7px] text-xs text-secondary transition-colors enabled:hover:text-accent disabled:text-disabled-ink ${className}`} {...props}>{children}</button>;
}

export function Dot({ arlo = false }) {
  return <i className={`${arlo ? 'arlo-dot bg-gold' : 'you-dot bg-accent'} inline-block size-[5px] shrink-0 rounded-full`} />;
}

export function Eyebrow({ children }) {
  return <p className="eyebrow mb-[11px] text-[9px] font-semibold tracking-[2px] text-muted">{children}</p>;
}
