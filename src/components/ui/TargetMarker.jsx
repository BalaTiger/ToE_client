export function TargetMarker({ down = false }) {
  return <svg className="toe-target-marker" data-direction={down ? 'down' : 'up'}
    viewBox="0 0 32 36" width="24" height="27" aria-hidden="true" focusable="false"
    fill="none" stroke="#c7a264" strokeWidth="1.25" strokeLinejoin="round">
    <path d="M16 2 27 21 20 18v10l-4 6-4-6V18l-7 3Z" fill="#142b26" />
    <path d="m16 5 5 12-5-3-5 3Z" fill="#bcebd0" stroke="none" />
    <path d="M16 17v11m-3-6h6M9 19l-5 4 3 3m16-7 5 4-3 3" />
  </svg>;
}
