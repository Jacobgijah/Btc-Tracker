/**
 * Decorative line-art for the login page (left: notes + stats blocks, right: someone
 * working on a laptop). Pure SVG coloured with the semantic aliases, hidden from
 * assistive tech and only shown on wide screens.
 */
import { cx } from '../../lib/cx'

const LINE = 'fill-none stroke-text-muted'

/** Gold block with scattered dots, like the stat pillars in the design. */
function DottedBlock({ id, x, y, w, h }: { id: string; x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <defs>
        <pattern id={id} x={x} y={y} width="30" height="30" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="3.6" className="fill-bg" />
          <circle cx="22" cy="14" r="3.6" className="fill-bg" />
          <circle cx="11" cy="24" r="3.6" className="fill-bg" />
        </pattern>
      </defs>
      <rect x={x} y={y} width={w} height={h} className="fill-accent" />
      <rect x={x} y={y} width={w} height={h} fill={`url(#${id})`} />
    </g>
  )
}

export function LoginArtLeft({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 290 436" className={cx('overflow-visible', className)} aria-hidden focusable="false">
      <circle cx="151" cy="6" r="4" className={LINE} strokeWidth="1.3" />
      <path
        d="M20 60c14 8 30 2 36-12 5-12-4-18-8-7-4 12 2 30 18 25 16-6 20-30 32-32 12-2 8 20 22 20 13 0 18-16 44-10"
        className={LINE}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Note card with a speech tail */}
      <rect x="53" y="106" width="118" height="83" className="fill-surface stroke-text-muted" strokeWidth="1.3" />
      <path d="M82 135h68M82 160h51" className={LINE} strokeWidth="1.3" />
      <path d="M53 189v31l25-31" className="fill-none stroke-accent" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="210" cy="196" r="6" className={LINE} strokeWidth="1.3" />
      {/* Stats pillars */}
      <DottedBlock id="login-dots-left" x={1} y={270} w={89} h={166} />
      <rect x="106" y="331" width="90" height="105" className="fill-surface stroke-text-muted" strokeWidth="1.3" />
      <path d="M132 418c14-10 26-34 30-66" className={LINE} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M154 360l8-9 5 11" className={LINE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M213 338c10 6 20 2 22-8 2-9-6-10-6-2 0 9 8 16 18 10 10-7 22-18 38-24"
        className={LINE}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function LoginArtRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 385 491" className={cx('overflow-visible', className)} aria-hidden focusable="false">
      <path
        d="M2 22c9 5 18 0 22-9 3-8-4-11-5-3-2 9 6 17 21 11"
        className={LINE}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Note card */}
      <rect x="41" y="107" width="71" height="49" className="fill-surface stroke-text-muted" strokeWidth="1.3" />
      <path d="M55 125h40M55 137h40" className={LINE} strokeWidth="1.3" />
      <path d="M100 156l12 19v-19" className="fill-none stroke-accent" strokeWidth="1.3" strokeLinejoin="round" />
      <path
        d="M256 152c10 4 20-2 24-12 4-10-6-12-6-3 0 10 10 16 22 8 12-9 14-22 22-20 8 3 6 16 18 14 10-2 18-8 49-9"
        className={LINE}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="374" cy="103" r="4" className={LINE} strokeWidth="1.3" />
      <circle cx="37" cy="277" r="3" className={LINE} strokeWidth="1.3" />
      <path d="M2 270l24-24" className="fill-none stroke-accent" strokeWidth="1.3" />

      {/* Seat and pillar */}
      <rect x="114" y="310" width="110" height="181" className="fill-surface stroke-text-muted" strokeWidth="1.3" />
      <DottedBlock id="login-dots-right" x={238} y={340} w={82} h={151} />

      {/* Person: legs */}
      <path
        d="M172 256c-42 6-78 14-94 34-8 14 2 29 22 28l130-8c14-20 12-48 10-54z"
        className="fill-bg stroke-text"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M82 300c-20 30-35 58-45 78l16 9c18-28 42-52 57-69"
        className="fill-bg stroke-text"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M22 380l24-5 8 15-28 6z" className="fill-text" />
      <path
        d="M150 313c-5 37-12 67-18 89l18 2c8-24 18-58 25-91"
        className="fill-bg stroke-text"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M128 402l24 2-2 16-32-4z" className="fill-text" />

      {/* Laptop */}
      <path d="M50 190l9-3 30 75-9 4z" className="fill-accent" />
      <path d="M80 266l62-8" className="fill-none stroke-accent" strokeWidth="5" strokeLinecap="round" />

      {/* Torso with pattern */}
      <path d="M178 178c17-6 47-3 58 8l4 69-68 3c-4-28-2-58 6-80z" className="fill-text" />
      <path
        d="M190 195l6-7M214 192l-5 8M226 206l6-6M196 214l-4 8M218 222l7-4M186 236l6-5M206 240l-3 8M228 238l4 7"
        className="fill-none stroke-bg"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Arm reaching to the keyboard */}
      <path
        d="M186 196c-24 20-52 42-84 54"
        className="fill-none stroke-text"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M102 250l-10-4M102 250l-9 3M103 250l-7 8" className={LINE} strokeWidth="1.3" strokeLinecap="round" />

      {/* Head and hair */}
      <circle cx="192" cy="154" r="22" className="fill-bg stroke-text" strokeWidth="1.6" />
      <path
        d="M171 146c2-22 32-30 43-10 10 17 26 38 43 54-18 3-36-4-44-18-4-7-8-15-13-22-8-10-20-10-29-4z"
        className="fill-text"
      />
      <circle cx="208" cy="126" r="7.5" className="fill-text" />
      <path d="M180 156c3 3 7 3 10 0" className="fill-none stroke-text" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
