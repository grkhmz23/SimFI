import{e as r,r as h,j as a,o as s,q as d}from"./index-B4iFEUUJ.js";/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=r("ArrowDownRight",[["path",{d:"m7 7 10 10",key:"1fmybs"}],["path",{d:"M17 7v10H7",key:"6fjiku"}]]);/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=r("ArrowUpRight",[["path",{d:"M7 7h10v10",key:"1tivn9"}],["path",{d:"M7 17 17 7",key:"1vkiza"}]]),g=h.forwardRef(({className:o,value:c,variant:t="default",diff:e,prefix:n,suffix:x,mono:i=!0,...l},m)=>{const p=t==="gain"?"text-[var(--accent-gain)]":t==="loss"?"text-[var(--accent-loss)]":t==="premium"?"text-[var(--accent-premium)]":t==="secondary"?"text-[var(--text-secondary)]":t==="tertiary"?"text-[var(--text-tertiary)]":"text-[var(--text-primary)]";return a.jsxs("span",{ref:m,className:s("inline-flex items-center gap-1.5 tabular-nums",i&&"font-mono",p,o),...l,children:[n,c,x,e!==void 0&&e!==0&&a.jsxs("span",{className:s("inline-flex items-center gap-0.5 text-xs",e>0?"text-[var(--accent-gain)]":"text-[var(--accent-loss)]"),children:[e>0?a.jsx(u,{className:"h-3 w-3",strokeWidth:1.5}):a.jsx(y,{className:"h-3 w-3",strokeWidth:1.5}),d(e)]})]})});g.displayName="DataCell";export{u as A,g as D};
