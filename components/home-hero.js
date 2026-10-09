// Home's hero: keeps the two side blocks (the pipeline and the funnel)
// exactly as tall as the meters in the middle — from the top of the
// highest ring to the bottom of the lowest ring's 0 / target labels (not
// the period label under it). The FA's one PCR meter and the admin's
// week meters (any layout) alike: it measures them and sets
// --hero-band-top / --hero-band-height on .home-hero (home-hero.css).

// In a meter's 280-wide viewBox (pcr-meter.js): the ring's top edge
// (centre 140, radius 100, 20 thick) and the bottom of its tick labels.
const _HERO_RING_TOP = 30;
const _HERO_TICKS_BOTTOM = 258;

function syncHeroBand() {
  const hero = document.querySelector('.home-hero');
  const centre = hero?.querySelector('.hero-center');
  if (!centre) return;
  const svgs = [...centre.querySelectorAll('.pcr-meter-svg')].filter(s => s.getBoundingClientRect().width > 0);
  if (!svgs.length) return;
  const origin = centre.getBoundingClientRect().top;
  let top = Infinity;
  let bottom = -Infinity;
  svgs.forEach(svg => {
    const r = svg.getBoundingClientRect();
    const scale = r.width / 280;
    top = Math.min(top, r.top + _HERO_RING_TOP * scale);
    bottom = Math.max(bottom, r.top + _HERO_TICKS_BOTTOM * scale);
  });
  hero.style.setProperty('--hero-band-top', `${Math.round(top - origin)}px`);
  hero.style.setProperty('--hero-band-height', `${Math.round(bottom - top)}px`);
}

// Again whenever the middle changes size: a new layout, the FA's meter
// swapped for the week meters, the window resized.
function initHomeHero() {
  const centre = document.querySelector('.home-hero .hero-center');
  if (!centre) return;
  new ResizeObserver(syncHeroBand).observe(centre);
  syncHeroBand();
}
