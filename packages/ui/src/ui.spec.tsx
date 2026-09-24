import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, Card, cn, StatusBadge } from './index';

describe('cn', () => {
  it('joins truthy classes only', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
});

describe('Button', () => {
  it('renders a non-submitting button with a large touch target', () => {
    const onClick = vi.fn<() => void>();
    render(<Button onClick={onClick}>Продажа</Button>);
    const button = screen.getByRole('button', { name: 'Продажа' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('min-h-12');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Card & StatusBadge', () => {
  it('renders title and content', () => {
    render(
      <Card title="Система">
        <StatusBadge tone="success">Работает</StatusBadge>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Система' })).toBeInTheDocument();
    expect(screen.getByText('Работает')).toBeInTheDocument();
  });
});

describe('form fields', () => {
  it('TextField links label, input and error message', async () => {
    const { TextField } = await import('./index');
    render(<TextField label="Название" error="Обязательное поле" defaultValue="" />);
    const input = screen.getByLabelText('Название');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Обязательное поле');
  });

  it('SelectField renders options', async () => {
    const { SelectField } = await import('./index');
    render(
      <SelectField
        label="Роль"
        options={[
          { value: 'SELLER', label: 'Продавец' },
          { value: 'WAREHOUSE', label: 'Склад' },
        ]}
      />,
    );
    expect(screen.getByLabelText('Роль')).toHaveDisplayValue('Продавец');
  });

  it('CheckboxField toggles', async () => {
    const { CheckboxField } = await import('./index');
    render(<CheckboxField label="Все филиалы" />);
    const box = screen.getByLabelText('Все филиалы');
    fireEvent.click(box);
    expect(box).toBeChecked();
  });
});
