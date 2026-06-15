export const commentKeys = {
  all: ['comments'] as const,
  lists: (invoiceId: string) =>
    [...commentKeys.all, 'list', invoiceId] as const,
  detail: (id: string) => [...commentKeys.all, 'detail', id] as const,
};
