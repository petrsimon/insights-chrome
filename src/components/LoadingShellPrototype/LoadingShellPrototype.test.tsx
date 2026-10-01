import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingShellRemoteContent } from './LoadingShellContent';

describe('LoadingShellRemoteContent', () => {
  it('renders app-pane placeholders without duplicating the Chrome frame', () => {
    const { container } = render(<LoadingShellRemoteContent />);

    expect(screen.getByRole('status', { name: 'Loading application placeholders' })).toBeInTheDocument();
    expect(container.querySelector('.pf-v6-c-masthead')).not.toBeInTheDocument();
    expect(container.querySelector('footer')).not.toBeInTheDocument();
  });
});
