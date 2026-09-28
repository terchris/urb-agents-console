// The console's look: one stylesheet for the page, the partial and the embed.
//
// Modelled on the calm, dense look of modern product dashboards (Linear, Vercel, Grafana, Logfire,
// PostHog), not on any one brand (Terje, 2026-09-29): a neutral zinc base with one accent, thin
// borders rather than heavy shadows, Geist for text and numbers, stat tiles on top, and cards on a
// grid. Dark mode is chosen, not inverted: its own greys, with the accent lifted for the dark ground.
//
// Data colours are not the brand's: event kinds use the dataviz reference categorical slots 1–4
// in fixed order, validated on these surfaces (light #fff: pass, contrast relieved by the kind in
// words; dark #141418: pass). Magnitude (the rhythm heat strip) is one blue ramp, in rhythm-view.
//
// Layout: a sticky top bar; a hero (title, stat tiles, or the followed agent's profile); then
// cards on a 12-column grid, which collapse to one column on a phone. Nothing scrolls sideways.

export const FONTS = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap";

/** Runs before first paint: applies a stored light/dark choice, so the page never flashes. */
export const THEME_HEAD = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const LIGHT = `
  color-scheme: light;
  --ground:#F7F7F8; --surface:#FFFFFF; --surface-2:#F2F2F4; --line:#E4E4E7; --line-2:#EEEEF1;
  --ink:#18181B; --muted:#52525B; --faint:#8B8B94;
  --accent:#2563EB; --accent-soft:#E8EEFD; --good:#16A34A;
  --link:#B4B4BD; --node:#9A9AA3; --fresh:#FEF3C7;
  --shadow:0 1px 2px rgba(24,24,27,.04);
  --opened:#2a78d6; --moved:#eb6834; --replied:#1baf7a; --closed:#eda100;`;

const DARK = `
  color-scheme: dark;
  --ground:#0A0A0D; --surface:#141418; --surface-2:#1C1C22; --line:#2A2A31; --line-2:#212128;
  --ink:#EDEDEF; --muted:#A1A1AA; --faint:#71717A;
  --accent:#6EA8FE; --accent-soft:#1B2A45; --good:#4ADE80;
  --link:#3F3F48; --node:#71717A; --fresh:#3A3217;
  --shadow:0 1px 2px rgba(0,0,0,.4);
  --opened:#3987e5; --moved:#d95926; --replied:#199e70; --closed:#c98500;`;

export const CSS = `
:root{${LIGHT}
  --display:"Geist","Inter","Segoe UI",system-ui,sans-serif;
  --sans:"Geist","Inter","Segoe UI",system-ui,sans-serif;
  --mono:"Geist Mono",ui-monospace,"SF Mono",Menlo,monospace;
  --r:12px; --gap:16px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK}}}
:root[data-theme="dark"]{${DARK}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-underline-offset:2px}
.muted{color:var(--muted)}
.wrap{max-width:1200px;margin:0 auto;padding:0 20px}

/* top bar */
.bar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--ground) 86%,transparent);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line-2)}
.bar .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;min-height:60px;padding-top:8px;padding-bottom:8px}
.brand{display:flex;align-items:center;gap:.55rem;font:600 1rem/1 var(--display);letter-spacing:-.02em;color:var(--ink);text-decoration:none;margin-right:auto}
.brand .mark{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,var(--opened),var(--replied));box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--surface) 30%,transparent)}
.live-pill{display:inline-flex;align-items:center;gap:.35rem;font:600 .72rem/1 var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--good);background:color-mix(in srgb,var(--good) 12%,transparent);padding:.3rem .55rem;border-radius:999px}
.live-pill.waiting{color:var(--muted);background:var(--surface-2)}
.live-dot{flex-shrink:0;width:.5rem;height:.5rem;border-radius:50%;background:var(--good);animation:beat 2.4s infinite}
@keyframes beat{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--good) 55%,transparent)}70%{box-shadow:0 0 0 .45rem transparent}100%{box-shadow:0 0 0 0 transparent}}
.controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.seg{display:inline-flex;background:var(--surface-2);border-radius:10px;padding:3px}
.seg a{padding:.3rem .7rem;border-radius:8px;text-decoration:none;color:var(--muted);font-weight:600;font-size:.85rem}
.seg a[aria-current]{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(22,33,58,.12)}
.pick{display:inline-flex}
.pick label{display:inline-flex;align-items:center;gap:.4rem;font-size:.85rem;color:var(--muted)}
.pick label span{display:none}
.pick select{font:600 .85rem var(--sans);color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:.35rem 1.8rem .35rem .6rem;appearance:none;-webkit-appearance:none;
  background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 14px) 55%,calc(100% - 9px) 55%;background-size:5px 5px;background-repeat:no-repeat;max-width:13rem}
.chip-x{display:inline-flex;align-items:center;gap:.3rem;font-size:.8rem;color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:.25rem .6rem;background:var(--surface)}
.icon-btn{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--muted);font:600 .8rem var(--sans);cursor:pointer}
.icon-btn:hover,.chip-x:hover{color:var(--ink);border-color:var(--faint)}

/* hero */
.hero{padding:28px 0 8px}
.hero h1{margin:0;font:600 clamp(1.6rem,3.6vw,2.2rem)/1.1 var(--display);letter-spacing:-.03em}
.hero .lede{margin:.5rem 0 0;color:var(--muted);font-size:1.02rem;max-width:44rem}
.note{margin:1rem 0 0;background:var(--surface);border:1px dashed var(--line);border-radius:12px;padding:.7rem .9rem;color:var(--muted);font-size:.9rem}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0 0}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:14px 16px;min-width:0;display:flex;flex-direction:column;gap:6px}
.tile .t-label{font-size:.76rem;font-weight:500;color:var(--muted)}
.tile .t-value{font:600 1.75rem/1 var(--display);letter-spacing:-.03em}
.tile .t-sub{font-size:.78rem;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .spark.fill{width:100%;height:30px}
.spark.fill polyline{stroke:var(--accent);stroke-width:1.75}
.spark.fill .area{fill:color-mix(in srgb,var(--accent) 12%,transparent);stroke:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.stack{display:flex;align-items:center;min-height:26px}
.stack .face{margin-left:-7px;box-shadow:0 0 0 2px var(--surface)}
.stack .face:first-child{margin-left:0}
.stack .more{margin-left:6px;font-size:.78rem;color:var(--muted)}
.digest{margin:14px 0 0;color:var(--muted);font-size:.9rem;max-width:60rem}

/* profile hero (following an agent) */
.profile-card{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:start;margin:20px 0 0;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:20px 22px}
.pf-face{width:84px;height:84px;border-radius:50%}
.pf-body{min-width:0}
.pf-name{margin:0;font:600 1.5rem/1.15 var(--display);letter-spacing:-.03em}
.pf-role{display:inline-block;margin-left:.55rem;font:500 1rem var(--sans);color:var(--muted)}
.pf-summary{margin:.45rem 0 0;max-width:48rem;font-size:1rem}
.pf-h{margin:1rem 0 .3rem;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--faint)}
.pf-does{margin:0;padding-left:1.1rem;max-width:48rem}
.pf-does li{margin:.2rem 0}
.pf-skills{list-style:none;padding:0;margin:.9rem 0 0;display:flex;flex-wrap:wrap;gap:6px}
.pf-skills li{font-size:.78rem;font-weight:600;background:var(--surface-2);color:var(--muted);border-radius:999px;padding:.2rem .65rem}
.pf-links{margin:.9rem 0 0;font-size:.9rem;display:flex;flex-wrap:wrap;gap:.3rem .9rem}
.pf-src{margin:.4rem 0 0;font-size:.78rem;color:var(--faint)}

/* cards and grid */
.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:var(--gap);margin:22px 0 0}
.card{grid-column:span 12;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:18px 20px 20px;min-width:0}
.span-8{grid-column:span 8}.span-4{grid-column:span 4}
.card-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;margin:0 0 10px}
.card h2{margin:0;font:600 .98rem/1.2 var(--display);letter-spacing:-.01em;text-transform:none;color:var(--ink)}
.card h2 small,.card-head .sub{font:500 .8rem var(--sans);color:var(--faint);margin-left:.4rem}
.how{margin:0 0 .6rem;color:var(--muted);font-size:.86rem;max-width:44rem}
.focus{margin:.1rem 0 .6rem;font-size:.9rem}
.face{display:inline-block;border-radius:50%;flex-shrink:0;object-fit:cover;background:var(--surface-2);vertical-align:middle}
.face.initials{display:inline-grid;place-items:center;font:700 .62rem/1 var(--sans);color:var(--muted);letter-spacing:.02em}
.empty{color:var(--faint);font-size:.9rem}

/* the network */
.net{display:block;width:100%;height:auto;overflow:visible}
.net-compact{display:none}
.net .link .edge{fill:none;stroke:var(--link);stroke-linecap:round;opacity:var(--w,.75)}
.net .link .head{fill:var(--link);opacity:var(--w,.75)}
.net .link .hit{fill:none;stroke:transparent;stroke-width:14}
.net .link:hover .edge,.net .link.hot .edge{stroke:var(--accent);opacity:1}
.net .link:hover .head,.net .link.hot .head{fill:var(--accent);opacity:1}
.net.has-sel .link:not(.hot){opacity:.15}
.net .node .dot{fill:var(--node);stroke:var(--surface);stroke-width:2}
.net .node .dot.pic{fill:var(--surface-2)}
.net .node .ring{fill:none;stroke:var(--surface);stroke-width:2.5}
.net .node .hit{fill:transparent}
.net .node text{fill:var(--ink);font:600 13px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
.net-compact .node text.ini{font:700 11px var(--sans);fill:var(--surface);stroke:none;pointer-events:none}
.net-compact .node.idle text.ini{fill:var(--faint)}
.pairs{list-style:none;margin:.6rem 0 0;padding:0;display:none}
.pairs li{display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:.55rem 0;border-bottom:1px solid var(--line-2)}
.pairs li:last-child{border-bottom:0}
.pairs .p-who{display:flex;align-items:center;gap:6px;min-width:0;font-weight:600;font-size:.86rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pairs .p-who > span:not(.arrow){overflow:hidden;text-overflow:ellipsis}
.pairs .arrow{color:var(--faint);font-weight:400}
.pairs .p-bar{grid-column:1;height:5px;border-radius:3px;background:var(--surface-2);overflow:hidden}
.pairs .p-bar i{display:block;height:100%;background:var(--accent);border-radius:3px}
.pairs .p-n{grid-column:2;grid-row:1 / span 2;align-self:center;font:500 .86rem var(--mono);color:var(--muted)}
.network{display:flex;flex-direction:column}
.network .net-wide{margin:auto 0}
.net .node.idle .dot{fill:var(--line)}
.net .node.idle text{fill:var(--faint);font-weight:500}
.net .node.idle image{opacity:.4;filter:grayscale(1)}
.net .node.others text{font-style:italic;font-weight:500}
.net .node.sel .dot{fill:var(--accent)}
.net .node.sel .ring{stroke:var(--accent);stroke-width:3.5}
.net .node.active .ring,.net .node.active .dot{stroke:var(--good);stroke-width:3;animation:beat-ring 2.4s infinite}
@keyframes beat-ring{0%,100%{stroke-opacity:1}50%{stroke-opacity:.3}}
.net.has-sel .node:not(.sel):not(.nb){opacity:.3}
.net a:focus{outline:none}
.net a:focus-visible .ring,.net a:focus-visible .dot{stroke:var(--accent);stroke-width:3.5}
.net .link.pulse .edge{animation:pulse-edge 2.5s ease-out 2}
.net .link.pulse .head{animation:pulse-head 2.5s ease-out 2}
@keyframes pulse-edge{0%{stroke:var(--accent);opacity:1;stroke-width:9}100%{}}
@keyframes pulse-head{0%{fill:var(--accent);opacity:1}100%{}}
.twin{margin:.6rem 0 0;font-size:.88rem}
.twin summary{cursor:pointer;color:var(--accent);font-weight:600}
.twin table{border-collapse:collapse;margin-top:.5rem;width:100%}
.twin th,.twin td{text-align:left;padding:.3rem .6rem .3rem 0;border-bottom:1px solid var(--line-2)}
.twin th{color:var(--muted);font-weight:600}
.twin .n{text-align:right;font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto;max-width:100%}
.scroll table{width:auto}
.scroll th,.scroll td{white-space:nowrap}

/* right now */
.feed{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.feed li{display:grid;grid-template-columns:30px 1fr;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-2)}
.feed li:last-child{border-bottom:0}
.feed .f-what{font-size:.88rem;line-height:1.4;min-width:0;overflow-wrap:anywhere}
.feed .f-meta{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:.74rem;color:var(--faint)}
.feed .dot{width:.45rem;height:.45rem}

/* agents table */
table.inv{border-collapse:collapse;width:100%;font-size:.88rem}
table.inv th,table.inv td{text-align:left;padding:.5rem .6rem .5rem 0;border-bottom:1px solid var(--line-2);vertical-align:middle}
table.inv thead th{color:var(--faint);font-weight:600;font-size:.74rem;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;border-bottom-color:var(--line)}
table.inv thead button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-transform:inherit;letter-spacing:inherit}
table.inv thead th[aria-sort="descending"] button::after{content:" ↓"}
table.inv thead th[aria-sort="ascending"] button::after{content:" ↑"}
table.inv tbody tr:hover{background:color-mix(in srgb,var(--surface-2) 45%,transparent)}
table.inv tbody tr:last-child th,table.inv tbody tr:last-child td{border-bottom:0}
table.inv .n{text-align:right;font-variant-numeric:tabular-nums}
table.inv tbody th{font-weight:600;white-space:nowrap}
table.inv tbody th a{color:var(--ink);text-decoration:none}
table.inv tbody th a:hover{text-decoration:underline}
table.inv tr.sel th a{color:var(--accent)}
table.inv tr.others th a{font-style:italic;font-weight:500;color:var(--muted)}
table.inv .who-cell{display:flex;align-items:center;gap:.6rem}
table.inv .av{width:30px;height:30px;border-radius:50%;flex-shrink:0}
table.inv .av.none{display:inline-block;background:var(--surface-2)}
table.inv .role{display:block;font-weight:500;font-size:.74rem;color:var(--faint)}
table.inv .profile{font-weight:500;font-size:.78rem;margin-left:.3rem;text-decoration:none}
table.inv .seen{white-space:nowrap;color:var(--muted)}
table.inv .seen b{color:var(--good);font-weight:700}
table.inv .c-models{color:var(--muted);font-size:.8rem;white-space:nowrap}
table.inv .c-models .more{color:var(--accent)}
.now{display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:var(--good);animation:beat 2.4s infinite}
.now.off{background:transparent;animation:none}
.spark{display:block;overflow:visible}
.spark polyline{fill:none;stroke:var(--faint);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
.spark circle{fill:var(--accent)}
.inv-wrap{overflow-x:auto;max-width:100%}

/* timeline */
.histo{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));align-items:end;gap:2px;height:48px;margin:.2rem 0 .8rem;border-bottom:1px solid var(--line)}
.histo a{display:flex;align-items:flex-end;height:100%}
.histo i{display:block;width:100%;background:var(--link);border-radius:3px 3px 0 0}
.histo a.on i{background:var(--accent)}
.histo a:hover i,.histo a:focus-visible i{background:var(--ink)}
.legend{list-style:none;padding:0;margin:0 0 .3rem;display:flex;flex-wrap:wrap;gap:.3rem 1rem;color:var(--muted);font-size:.8rem}
.legend li{display:flex;align-items:center;gap:.35rem}
h3.day{margin:1rem 0 .2rem;font:700 .76rem var(--sans);text-transform:uppercase;letter-spacing:.07em;color:var(--faint)}
.events{list-style:none;padding:0;margin:0}
.ev{display:grid;grid-template-columns:3.2rem 22px 1fr auto;align-items:center;gap:.6rem;padding:.45rem .3rem;border-bottom:1px solid var(--line-2);border-radius:8px}
.ev:last-child{border-bottom:0}
.ev time{color:var(--faint);font:400 .8rem var(--mono)}
.ev .what{min-width:0;overflow-wrap:anywhere;font-size:.9rem}
.ev:focus{outline:2px solid var(--accent);outline-offset:-2px}
.dot{display:inline-block;width:.55rem;height:.55rem;border-radius:50%;flex-shrink:0}
.k-opened .dot{background:var(--opened)}.k-moved .dot{background:var(--moved)}.k-replied .dot{background:var(--replied)}.k-closed .dot{background:var(--closed)}
.ev .kind{position:relative}
.ev .kind .dot{position:absolute;right:-2px;bottom:-2px;width:.55rem;height:.55rem;box-shadow:0 0 0 2px var(--surface)}
.who{font-weight:600}
.who.others,.who.none{font-weight:500;font-style:italic;color:var(--muted)}
.state{font-weight:600}
.model{font:400 .7rem var(--mono);color:var(--muted);background:var(--surface-2);border-radius:999px;padding:.12rem .55rem;white-space:nowrap}
.fresh{animation:fresh 4s ease-out}
@keyframes fresh{from{background:var(--fresh)}to{background:transparent}}
.more{margin:1rem 0 0}
.kbd-hint{font:500 .74rem var(--sans);color:var(--faint)}

/* footer, tooltip, keys */
footer{margin:34px 0 0;padding:22px 0 40px;border-top:1px solid var(--line);color:var(--muted);font-size:.84rem}
footer p{margin:.3rem 0;max-width:52rem}
#tip{position:fixed;z-index:40;max-width:22rem;pointer-events:none;background:var(--ink);color:var(--surface);font-size:.8rem;line-height:1.35;padding:.4rem .6rem;border-radius:8px;box-shadow:var(--shadow)}
dialog#keys{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);color:var(--ink);padding:1.1rem 1.3rem;max-width:22rem;box-shadow:var(--shadow)}
dialog#keys::backdrop{background:rgb(15 23 40 / .45)}
dialog#keys h2{margin:0 0 .6rem;font:600 1.05rem var(--display)}
dialog#keys dl{display:grid;grid-template-columns:auto 1fr;gap:.4rem .9rem;margin:0 0 .9rem}
dialog#keys dd{margin:0}
dialog#keys button{font:600 .85rem var(--sans);border:1px solid var(--line);background:var(--surface-2);color:var(--ink);border-radius:8px;padding:.35rem .8rem;cursor:pointer}
kbd{font:500 .76rem var(--mono);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 .35rem;background:var(--ground)}

@media (prefers-reduced-motion:reduce){.live-dot,.now,.net .link.pulse .edge,.net .link.pulse .head,.net .node.active .ring,.net .node.active .dot,.fresh{animation:none}}

/* tablet */
@media (max-width:62rem){.span-8,.span-4{grid-column:span 12}.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
/* phone */
@media (max-width:40rem){
  :root{--gap:14px}
  .wrap{padding:0 16px}
  .bar .wrap{min-height:54px}
  .controls{width:100%}
  .pick{flex:1}.pick select{width:100%;max-width:none}
  .hero{padding-top:20px}
  .tile{padding:12px 13px}.tile .t-value{font-size:1.55rem}
  .card{padding:15px 15px 16px;border-radius:14px}
  .span-4.feed-card{order:-1}
  .net-wide{display:none}.net-compact{display:block;max-width:360px;margin:0 auto}
  .pairs{display:block}
  .profile-card{grid-template-columns:1fr;padding:18px}
  .pf-face{width:64px;height:64px}
  .ev{grid-template-columns:2.9rem 22px 1fr}.ev .model{grid-column:3;justify-self:start}
  /* the agents table becomes a list of small cards */
  table.inv,table.inv tbody,table.inv tr,table.inv th,table.inv td{display:block}
  table.inv thead{display:none}
  table.inv tbody tr{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 8px;padding:.75rem 0;border-bottom:1px solid var(--line-2)}
  table.inv tbody tr:last-child{border-bottom:0}
  table.inv tbody th,table.inv tbody td{border:0;padding:0}
  table.inv tbody th{grid-column:1 / -1;white-space:normal}
  table.inv td.n{text-align:left;font-size:.9rem;font-weight:600}
  table.inv td[data-label]::before{content:attr(data-label);display:block;font:500 .64rem var(--sans);text-transform:uppercase;letter-spacing:.05em;color:var(--faint)}
  table.inv .c-models,table.inv .c-spark{display:none}
  table.inv tbody th{grid-column:1 / 4;grid-row:1}
  table.inv td.seen{grid-column:4;grid-row:1;justify-self:end;text-align:right;font-weight:500;font-size:.8rem;color:var(--muted)}
  table.inv td.seen::before{display:none}
  .inv-hint{display:none}
  table.inv .av{width:32px;height:32px}
}
`;
