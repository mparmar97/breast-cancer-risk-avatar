import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CalculatorScreen from '../../src/components/CalculatorScreen';

describe('CalculatorScreen', () => {
  it('calls onSelectScenario with the correct branch for each button', async () => {
    const user = userEvent.setup();
    const onSelectScenario = vi.fn();

    render(
      <CalculatorScreen onSelectScenario={onSelectScenario} loading={false} error={null} />,
    );

    await user.click(screen.getByRole('button', { name: /test average-risk branch/i }));
    expect(onSelectScenario).toHaveBeenLastCalledWith('average');

    await user.click(screen.getByRole('button', { name: /test elevated-risk branch/i }));
    expect(onSelectScenario).toHaveBeenLastCalledWith('elevated');
  });

  it('shows a loading indicator and disables buttons while loading', () => {
    render(<CalculatorScreen onSelectScenario={vi.fn()} loading error={null} />);

    expect(screen.getByRole('status')).toHaveTextContent(/calculating/i);
    expect(screen.getByRole('button', { name: /test average-risk branch/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /test elevated-risk branch/i })).toBeDisabled();
  });

  it('shows a readable error message when the calculation fails', () => {
    render(
      <CalculatorScreen
        onSelectScenario={vi.fn()}
        loading={false}
        error="Unable to calculate the demonstration result."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to calculate/i);
  });
});
