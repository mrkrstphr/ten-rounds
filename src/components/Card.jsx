import { memo, useLayoutEffect, useRef } from 'react';

const colors = {
  red: 'text-card-red', blue: 'text-card-blue', green: 'text-card-green',
  yellow: 'text-card-yellow', wild: 'text-card-wild', skip: 'text-card-skip',
};

export function cardLabel(card) {
  return card.kind === 'number' ? `${card.color} ${card.value}` : card.kind === 'wild' ? 'Wild card' : 'Skip card';
}

const CardFace = memo(function CardFace({ kind, value, hand }) {
  const corner = kind === 'number' ? value : kind.toUpperCase();
  const special = kind !== 'number';
  const cornerSize = hand
    ? special ? 'text-[5px] tablet:text-[4px] wide:text-[6px]' : 'text-[8px] tablet:text-[7px] wide:text-[9px] desktop:text-[10px]'
    : special ? 'text-[8px]' : 'text-xs';
  const valueSize = hand
    ? special ? 'text-[28px] tablet:text-[23px] wide:text-[30px] desktop:text-[33px]' : 'text-[29px] tablet:text-2xl wide:text-[30px] desktop:text-[36px]'
    : special ? 'text-[40px]' : 'text-[47px]';
  const cornerPosition = hand ? 'left-2 top-2 tablet:left-1.5 tablet:top-1.5 wide:left-2 wide:top-2 desktop:left-[9px] desktop:top-[9px]' : 'left-[11px] top-2.5';
  const bottomPosition = hand ? 'bottom-2 right-2 tablet:bottom-1.5 tablet:right-1.5 wide:bottom-2 wide:right-2 desktop:bottom-[9px] desktop:right-[9px]' : 'bottom-2.5 right-[11px]';
  return <>
    <span className={`card-corner absolute leading-none font-semibold ${special ? 'tracking-[.5px]' : 'tracking-[-.7px]'} ${cornerPosition} ${cornerSize}`}>{corner}</span>
    <span className={`card-value absolute inset-0 grid place-items-center font-display font-[550] ${special ? 'tracking-normal' : 'tracking-[-3px]'} ${valueSize}`} aria-hidden="true">{kind === 'wild' ? '✳' : kind === 'skip' ? '⊘' : value}</span>
    <span className={`card-suit absolute bottom-[9px] left-[9px] size-1 bg-current ${hand ? 'tablet:hidden wide:block' : ''} ${kind === 'number' ? 'rounded-full' : 'hidden'}`} aria-hidden="true" />
    <span className={`card-corner bottom absolute rotate-180 leading-none font-semibold ${bottomPosition} ${cornerSize}`} aria-hidden="true">{corner}</span>
  </>;
});

export function Card({ card, hand = false, selected = false, buttonRef, className = '', ...props }) {
  const dimensions = hand
    ? 'h-20 w-[53px] min-w-[53px] rounded-md tablet:aspect-[70/104] tablet:h-auto tablet:w-[calc((100%_-_40px)/11)] tablet:min-w-0 tablet:max-w-[70px] wide:w-[calc((100%_-_90px)/11)] wide:min-w-9 desktop:min-w-11'
    : 'h-[108px] w-[76px] rounded-lg tablet:h-[119px] tablet:w-[83px]';
  return <button ref={buttonRef} type="button"
    className={`card ${card?.color || ''} ${selected ? 'selected' : ''} relative isolate shrink-0 border border-card-border bg-card-face p-0 shadow-[0_3px_4px_var(--shadow)] transition-[transform,box-shadow,border-color] ${dimensions} ${colors[card?.color] || 'text-card-green'} ${hand ? selected ? 'transform-[translateY(-13px)] border-selected shadow-[0_0_0_1.5px_var(--selected),0_7px_14px_var(--shadow)]' : 'enabled:hover:transform-[translateY(-8px)]' : 'enabled:hover:transform-[translateY(-5px)]'} ${className}`}
    aria-label={card ? cardLabel(card) : 'Discard pile is empty'}
    {...(hand ? { 'data-id': card.id, 'aria-pressed': selected } : {})}
    {...props}>
    {card ? <CardFace kind={card.kind} value={card.value} hand={hand} /> : '—'}
  </button>;
}

export const HandCard = memo(function HandCard({ card, selected, disabled, delay, onToggle }) {
  const element = useRef(null), initialDelay = useRef(delay);
  useLayoutEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) return;
    const animation = element.current.animate(
      [{ opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' }],
      { duration: 250, delay: initialDelay.current, easing: 'ease', fill: 'backwards' },
    );
    animation.id = 'deal';
    const reduceMotion = () => { if (preference.matches) animation.finish(); };
    preference.addEventListener('change', reduceMotion);
    return () => { preference.removeEventListener('change', reduceMotion); animation.cancel(); };
  }, []);
  return <Card buttonRef={element} card={card} hand selected={selected} disabled={disabled} onClick={() => onToggle(card.id)} />;
}, (before, after) => before.card.id === after.card.id && before.selected === after.selected &&
  before.disabled === after.disabled && before.onToggle === after.onToggle);

export function DrawPile({ count, disabled, onDraw }) {
  return <button type="button" id="draw-pile" disabled={disabled} onClick={onDraw}
    aria-label={`Draw a card from the deck. ${count} cards remain.`}
    className="card card-back deck relative h-[108px] w-[76px] shrink-0 rounded-lg border-[5px] border-card-face bg-card-back p-0 text-card-back-ink shadow-[2px_2px_0_var(--card-face),3px_3px_0_var(--card-border),5px_5px_0_var(--card-face),6px_6px_0_var(--card-border),8px_9px_10px_var(--shadow)] transition-transform enabled:hover:-translate-y-[5px] tablet:h-[119px] tablet:w-[83px]">
    <span className="back-frame absolute inset-1 flex flex-col items-center justify-center rounded-xs border border-card-back-line">
      <span className="back-spark mb-2 text-[32px]">✳</span>
      <span className="back-word font-display text-[9px] font-semibold tracking-[.5px]">TenRounds</span>
    </span>
  </button>;
}

export { colors as cardColors };
