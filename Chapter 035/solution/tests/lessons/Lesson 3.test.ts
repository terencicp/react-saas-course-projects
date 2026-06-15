import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// NewInvoiceDialog is a 'use client' component that calls useRouter(). That hook
// throws outside Next's app-router runtime, which a node-env unit test does not
// provide. We stub the framework boundary (never the student's code) so the
// dialog wrapper and the route that composes it render, and so we can observe
// that closing the modal asks the router to navigate back. `back` is a shared
// spy we assert against.
const back = vi.fn();
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useRouter: () => ({ replace() {}, push() {}, back, refresh() {} }),
    useSearchParams: () => new URLSearchParams(),
  };
});

// The intercepting Dialog portals its content to <body>, so renderToStaticMarkup
// yields an empty string for it — there is no DOM to portal into. To observe the
// modal's composition we walk the React element tree instead of its markup.

// Find the first element anywhere in the tree that matches the predicate. We
// descend through children but do not call function components, so we read the
// props a parent passed (e.g. the data-testid on <DialogContent ...>), which is
// exactly the composition contract we want to assert.
const findElement = (
  node: unknown,
  predicate: (el: { type: unknown; props: Record<string, unknown> }) => boolean,
  depth = 0,
): { type: unknown; props: Record<string, unknown> } | undefined => {
  if (node == null || typeof node !== 'object' || depth > 12) return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, predicate, depth + 1);
      if (hit) return hit;
    }
    return undefined;
  }
  const element = node as { type: unknown; props?: Record<string, unknown> };
  if (
    element.props &&
    predicate({ type: element.type, props: element.props })
  ) {
    return element as { type: unknown; props: Record<string, unknown> };
  }
  if (element.props && 'children' in element.props) {
    return findElement(element.props.children, predicate, depth + 1);
  }
  return undefined;
};

const hasTestId = (id: string) => (el: { props: Record<string, unknown> }) =>
  el.props['data-testid'] === id;

// Render a synchronous Server Component (these route pages take no props).
const render = (el: ReactElement) => renderToStaticMarkup(el);

const importDefault = async <P>(path: string) => {
  const mod = (await import(path)) as { default: (props?: P) => unknown };
  return mod.default;
};

// Requirement 1 — clicking "New invoice" soft-navigates to /invoices/new, which
// the App Router resolves to the intercepting route. That route must present the
// form *as a modal*: the InvoiceForm wrapped in NewInvoiceDialog, with the dialog
// open. We observe the composition the route returns, not the portaled markup.
describe('the intercepting route opens the New invoice form as a modal', () => {
  it('wraps the InvoiceForm inside the NewInvoiceDialog', async () => {
    const InterceptedNewPage = await importDefault(
      '@/app/invoices/(.)new/page',
    );
    const page = InterceptedNewPage() as ReactElement<{
      children?: ReactElement | ReactElement[];
    }>;

    const wrapperName =
      typeof page.type === 'function' ? page.type.name : String(page.type);
    expect(
      wrapperName,
      'The intercepting route src/app/invoices/(.)new/page.tsx should render <NewInvoiceDialog>…</NewInvoiceDialog> as its outer element so the form appears as a modal over the list. It is still rendering a placeholder.',
    ).toBe('NewInvoiceDialog');

    const children = (
      Array.isArray(page.props.children)
        ? page.props.children
        : [page.props.children]
    ).filter((child): child is ReactElement => child != null);
    const formMarkup = children
      .map((child: ReactElement) => {
        try {
          return render(child);
        } catch {
          return '';
        }
      })
      .join('');
    expect(
      formMarkup,
      'The intercepting route should place <InvoiceForm /> inside the dialog (data-testid="invoice-form"). The dialog has no form to show.',
    ).toContain('data-testid="invoice-form"');
  });

  it('renders the dialog open, with no client open-state toggle deciding it', async () => {
    const { NewInvoiceDialog } = (await import(
      '@/components/new-invoice-dialog'
    )) as { NewInvoiceDialog: (props: { children: unknown }) => ReactElement };

    const tree = NewInvoiceDialog({ children: null });

    expect(
      (tree.props as { open?: unknown }).open,
      "NewInvoiceDialog should render <Dialog open …>: the route's existence is the open signal, not a useState boolean. The dialog is not forced open.",
    ).toBe(true);

    const content = findElement(tree, hasTestId('new-invoice-dialog'));
    expect(
      content,
      'NewInvoiceDialog should render its <DialogContent data-testid="new-invoice-dialog">. The dialog wrapper is still a passthrough fragment.',
    ).toBeDefined();
  });
});

// Requirement 2 — a direct visit (fresh tab/load) does not soft-navigate, so the
// App Router resolves the non-intercepting twin at /invoices/new. That twin must
// render the form as a full standalone page: the InvoiceForm plus a Cancel link
// back to /invoices, and crucially NOT the dialog chrome.
describe('a direct visit renders the full-page form, not the modal', () => {
  it('renders the InvoiceForm and a Cancel link to /invoices', async () => {
    const NewPage = await importDefault('@/app/invoices/new/page');
    const html = render(NewPage() as ReactElement);

    expect(
      html,
      'The full-page twin src/app/invoices/new/page.tsx should render <InvoiceForm /> (data-testid="invoice-form"). It is still a placeholder, so a direct visit or refresh to /invoices/new shows no form.',
    ).toContain('data-testid="invoice-form"');
    expect(
      html,
      'The full-page twin should offer a Cancel link back to the list (<Link href="/invoices">Cancel</Link>).',
    ).toContain('href="/invoices"');
  });

  it('does not render the modal dialog chrome', async () => {
    const NewPage = await importDefault('@/app/invoices/new/page');
    const html = render(NewPage() as ReactElement);

    expect(
      html,
      'The full-page twin must stand on its own — it should NOT render the NewInvoiceDialog (data-testid="new-invoice-dialog"). If it does, a direct visit shows a modal with no underlying page, which defeats the twin.',
    ).not.toContain('data-testid="new-invoice-dialog"');
  });
});

// Requirement 5 — closing the modal is a navigation, not a state toggle. Closing
// (onOpenChange(false)) must call router.back(), which pops the /invoices/new
// entry and returns to the list with clean history. Opening (onOpenChange(true))
// must NOT navigate.
describe('closing the modal navigates back and leaves history clean', () => {
  it('calls router.back() exactly once when the dialog is dismissed', async () => {
    back.mockClear();
    const { NewInvoiceDialog } = (await import(
      '@/components/new-invoice-dialog'
    )) as {
      NewInvoiceDialog: (props: { children: unknown }) => ReactElement;
    };

    const tree = NewInvoiceDialog({ children: null });
    const onOpenChange = (
      tree.props as { onOpenChange?: (open: boolean) => void }
    ).onOpenChange;

    expect(
      typeof onOpenChange,
      'NewInvoiceDialog should pass an onOpenChange handler to <Dialog>. Closing the modal must be wired to navigation, but no handler is set.',
    ).toBe('function');

    onOpenChange?.(false);
    expect(
      back.mock.calls.length,
      'Dismissing the dialog (onOpenChange(false)) should call router.back() so the /invoices/new history entry is popped and the user lands back on /invoices. back() was not called.',
    ).toBe(1);
  });

  it('does not navigate back while the dialog is open', async () => {
    back.mockClear();
    const { NewInvoiceDialog } = (await import(
      '@/components/new-invoice-dialog'
    )) as {
      NewInvoiceDialog: (props: { children: unknown }) => ReactElement;
    };

    const tree = NewInvoiceDialog({ children: null });
    const onOpenChange = (
      tree.props as { onOpenChange?: (open: boolean) => void }
    ).onOpenChange;

    onOpenChange?.(true);
    expect(
      back.mock.calls.length,
      'onOpenChange(true) means the dialog is opening, not closing — it must not call router.back(). Guard the navigation with `if (!open)`.',
    ).toBe(0);
  });
});
