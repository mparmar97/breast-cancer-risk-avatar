import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CalculatorScreen from '../../src/components/CalculatorScreen';

describe('CalculatorScreen', () => {
  it('submits calculator inputs from the form', async () => {
    const user = userEvent.setup();
    const onSubmitInputs = vi.fn();

    render(
      <CalculatorScreen
        onSubmitInputs={onSubmitInputs}
        onSelectScenario={vi.fn()}
        loading={false}
        error={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: /calculate and continue/i }));
    expect(onSubmitInputs).toHaveBeenCalledWith(
      expect.objectContaining({
        age: 45,
        firstDegreeRelatives: 0,
        atypicalHyperplasia: 'no',
      }),
    );
  });

  it('calls onSelectScenario with the correct branch for each demo button', async () => {
    const user = userEvent.setup();
    const onSelectScenario = vi.fn();

    render(
      <CalculatorScreen
        onSubmitInputs={vi.fn()}
        onSelectScenario={onSelectScenario}
        loading={false}
        error={null}
      />,
    );

    await user.click(screen.getByText(/quick demo scenarios/i));
    await user.click(screen.getByRole('button', { name: /test average-risk branch/i }));
    expect(onSelectScenario).toHaveBeenLastCalledWith('average');

    await user.click(screen.getByRole('button', { name: /test elevated-risk branch/i }));
    expect(onSelectScenario).toHaveBeenLastCalledWith('elevated');
  });

  it('shows a loading indicator and disables primary actions while loading', () => {
    render(
      <CalculatorScreen
        onSubmitInputs={vi.fn()}
        onSelectScenario={vi.fn()}
        loading
        error={null}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/calculating/i);
    expect(screen.getByRole('button', { name: /calculate and continue/i })).toBeDisabled();
  });

  it('shows a readable error message when the calculation fails', () => {
    render(
      <CalculatorScreen
        onSubmitInputs={vi.fn()}
        onSelectScenario={vi.fn()}
        loading={false}
        error="Unable to calculate the demonstration result."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to calculate/i);
  });

  it('allows clearing and retyping current age before submit', async () => {
    const user = userEvent.setup();
    const onSubmitInputs = vi.fn();

    render(
      <CalculatorScreen
        onSubmitInputs={onSubmitInputs}
        onSelectScenario={vi.fn()}
        loading={false}
        error={null}
      />,
    );

    const ageInput = screen.getByLabelText(/current age/i);
    await user.clear(ageInput);
    expect(ageInput).toHaveValue(null);

    await user.type(ageInput, '52');
    await user.click(screen.getByRole('button', { name: /calculate and continue/i }));
    expect(onSubmitInputs).toHaveBeenCalledWith(expect.objectContaining({ age: 52 }));
  });
});
