export function Ellipsis() {
  return (
    <>
      <span className="ellipsis-wrap" aria-hidden="true">
        <span className="ellipsis-dots">...</span>
      </span>
      <style>{`
        .ellipsis-wrap {
          display: inline-block;
          vertical-align: bottom;
          width: 1.5em;
          overflow: hidden;
        }
        .ellipsis-dots {
          display: inline-block;
          overflow: hidden;
          white-space: nowrap;
          width: 0;
          animation: ellipsis-grow 1.5s steps(3) infinite;
        }
        @keyframes ellipsis-grow {
          to { width: 1.5em; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ellipsis-dots {
            animation: none;
            width: 1.5em;
          }
        }
      `}</style>
    </>
  );
}
