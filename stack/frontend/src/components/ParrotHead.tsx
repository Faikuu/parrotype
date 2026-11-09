/** Original geometric parrot-head mark: a round head with a hooked beak. Fills with currentColor. */
export function ParrotHead({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="12" r="8.5" />
      <path d="M17.6 8.2c3-.6 5 1 4.4 4-.3 1.6-1.4 2.6-2.8 2.6-.5-.1-.9-.4-1.1-.9-.2-.6-.4-1.3-1.2-1.8-.7-.4-1.4-.6-2.3-.6l.3-2.6c.6 0 1.4 0 2.7-.7Z" />
      <circle cx="14.4" cy="9.7" r="1.3" fill="var(--bg)" />
    </svg>
  );
}
