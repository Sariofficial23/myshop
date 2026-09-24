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
