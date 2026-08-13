import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RecipeImage } from './RecipeImage';

// A real, public HTTPS URL — the brief asks for at least one genuine external
// address, not a placeholder like http://example.com/photo.jpg. jsdom never
// actually fetches it (no network access happens in this test file at all);
// what's under test is the `src`/`loading`/class attributes React puts on
// the <img>, and the fallback React swaps in when the browser fires `error`.
const EXTERNAL_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Chicken_lasagna.jpg/640px-Chicken_lasagna.jpg';

describe('RecipeImage', () => {
  it('renders an <img> wired for object-fit: cover and lazy loading', () => {
    render(<RecipeImage src={EXTERNAL_URL} alt="Lasanha de frango" />);
    const img = screen.getByRole('img', { name: 'Lasanha de frango' });
    expect(img).toHaveAttribute('src', EXTERNAL_URL);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img.className).toContain('object-cover');
  });

  it('shows the fallback, never a broken-image box, when src is null', () => {
    render(<RecipeImage src={null} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('swaps to the fallback if the real URL fails to load — no broken glyph left behind', () => {
    render(<RecipeImage src={EXTERNAL_URL} alt="Lasanha de frango" />);
    const img = screen.getByRole('img', { name: 'Lasanha de frango' });

    fireEvent.error(img);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a custom fallback when provided', () => {
    render(<RecipeImage src={null} fallback={<span>Sem foto</span>} />);
    expect(screen.getByText('Sem foto')).toBeInTheDocument();
  });

  it('gives a fresh attempt when src changes, rather than sticking with a previous failure', () => {
    const { rerender } = render(<RecipeImage src={EXTERNAL_URL} alt="Foto 1" />);
    fireEvent.error(screen.getByRole('img', { name: 'Foto 1' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<RecipeImage src="https://example.org/outra-foto.jpg" alt="Foto 2" />);
    expect(screen.getByRole('img', { name: 'Foto 2' })).toBeInTheDocument();
  });
});
