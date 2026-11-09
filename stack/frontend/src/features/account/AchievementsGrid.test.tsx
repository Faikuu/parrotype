import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import { AchievementsGrid } from './AchievementsGrid';

const UNLOCKED = [{ id: 'wpm_100' as const, unlockedAt: '2026-11-08T10:00:00Z' }];

function itemFor(name: string): HTMLElement {
  const item = screen.getByText(name).closest('li');
  if (!item) throw new Error(`no item for ${name}`);
  return item;
}

describe('AchievementsGrid', () => {
  it('shows all 16 achievements, with unlocked and locked states', () => {
    render(<AchievementsGrid achievements={UNLOCKED} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(16);

    const unlocked = itemFor('Speed parrot');
    expect(unlocked).toHaveAttribute('data-unlocked', 'true');
    expect(unlocked).not.toHaveClass('opacity-50');
    expect(within(unlocked).getByText('100 wpm in any test.')).toBeInTheDocument();
    expect(within(unlocked).getByText('Unlocked Nov 8, 2026')).toBeInTheDocument();
    expect(within(unlocked).getByText('Speed parrot')).toHaveClass('text-text');

    const locked = itemFor('Supersonic');
    expect(locked).toHaveAttribute('data-unlocked', 'false');
    expect(locked).toHaveClass('opacity-50');
    expect(within(locked).getByText('Supersonic')).toHaveClass('text-sub');
    expect(within(locked).queryByText(/Unlocked/)).not.toBeInTheDocument();
  });

  it('shows only the unlocked achievements when asked', () => {
    render(<AchievementsGrid achievements={UNLOCKED} onlyUnlocked />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Speed parrot')).toBeInTheDocument();
    expect(screen.queryByText('Supersonic')).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing is unlocked and only unlocked ones are shown', () => {
    render(<AchievementsGrid achievements={[]} onlyUnlocked />);
    expect(screen.getByText('No achievements yet.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
