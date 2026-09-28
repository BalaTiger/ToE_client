const paths = {
  treasure: 'M12 2 14.8 9.2 22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z',
  hunt: 'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3',
  cult: 'M15.8 2.5a9.8 9.8 0 1 0 5.7 14.8A9.1 9.1 0 0 1 15.8 2.5Z',
  rest: 'M4 10h13v5.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM17 11h1.5a3 3 0 0 1 0 6H17M3 22h16M7 2c-3 2 3 3 0 5M12 1c-3 2 3 3 0 5',
  multiply: 'M12 10V6M12 14l-5 3M12 14l5 3M14.5 3.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM8 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM22 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  end: 'M5 2h14M5 22h14M7 2v3c0 3 5 4.5 5 7S7 16 7 19v3M17 2v3c0 3-5 4.5-5 7s5 4 5 7v3M8 5h8M8 19h8',
  confirm: 'm4 12 5 5L20 6',
  cancel: 'm5 5 14 14M19 5 5 19',
};

export function ActionIcon({ kind }) {
  return (
    <svg className="toe-turn-icon" data-action-icon={kind} viewBox="0 0 24 24"
      width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      style={{ display: 'block', flexShrink: 0 }}>
      <path d={paths[kind] || paths.treasure} />
    </svg>
  );
}
