import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cn } from '../src/lib/utils';
import { EmptyState } from '../src/backend/feedback/EmptyState';
import { ErrorMessage } from '../src/backend/feedback/ErrorMessage';
import { LoadingMessage } from '../src/backend/feedback/LoadingMessage';
import * as barrel from '../src/index';

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe('EmptyState: says what is missing and offers the next step only when there is one', () => {
  it('renders the title alone, then the description and the action when given', () => {
    expect(html(<EmptyState title="No dishes" />)).toContain('No dishes');
    const full = html(<EmptyState title="No wines" description="Import a list." action={<button type="button">Import</button>} />);
    expect(full).toContain('Import a list.');
    expect(full).toContain("<button");
    expect(html(<EmptyState title="x" description={undefined} action={undefined} />)).not.toContain('<p');
  });
});

describe('ErrorMessage: announced to assistive technology, with a sensible default title', () => {
  it('has the alert role and the default title; a message and an action are optional', () => {
    const bare = html(<ErrorMessage />);
    expect(bare).toContain('role="alert"');
    expect(bare).toContain('Something went wrong');
    expect(bare).not.toContain('<p');
    const full = html(<ErrorMessage title="Gone" message="Try again later." action={<button>Retry</button>} />);
    expect(full).toContain('Gone');
    expect(full).toContain('Try again later.');
    expect(full).toContain('Retry');
  });
});

describe('LoadingMessage: a skeleton of the page, not a spinner', () => {
  it('shows the skeleton cards by default, none when asked, and a custom label', () => {
    const def = html(<LoadingMessage />);
    expect(def).toContain('role="status"');
    expect(def).toContain('Loading');
    expect((def.match(/animate-pulse|bg-accent/g) ?? []).length).toBeGreaterThan(0);
    const none = html(<LoadingMessage cards={0} label="Fetching" />);
    expect(none).toContain('Fetching');
    expect(none).not.toContain('sm:grid-cols-2');
    expect(html(<LoadingMessage cards={2} />).split('sr-only').length).toBeGreaterThan(1);
  });
});

describe('cn: merges Tailwind classes, the later one wins', () => {
  it('keeps the last conflicting class and drops falsy inputs', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', false, undefined, 'font-bold')).toBe('text-red-500 font-bold');
    expect(cn(['a', { b: true, c: false }])).toBe('a b');
  });
});

describe('the package entry point exports the shared pieces', () => {
  it('the feedback components and the helper are available from the barrel', () => {
    expect(barrel.EmptyState).toBe(EmptyState);
    expect(barrel.ErrorMessage).toBe(ErrorMessage);
    expect(barrel.LoadingMessage).toBe(LoadingMessage);
    expect(typeof barrel.cn).toBe('function');
    expect(barrel.Button).toBeDefined();
  });
});
