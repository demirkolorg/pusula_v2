import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  approveMutate: vi.fn(),
  rejectMutate: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useMutation: h.useMutation,
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      accessRequests: {
        list: {
          queryOptions: (input: unknown, options?: unknown) => ({
            key: 'board.accessRequests.list',
            input,
            ...(typeof options === 'object' && options ? options : {}),
          }),
          queryFilter: (input: unknown) => ({ key: 'board.accessRequests.list', input }),
        },
        approve: {
          mutationOptions: (options: unknown) => ({
            key: 'approve',
            ...(options as Record<string, unknown>),
          }),
        },
        reject: {
          mutationOptions: (options: unknown) => ({
            key: 'reject',
            ...(options as Record<string, unknown>),
          }),
        },
      },
      members: {
        list: { queryFilter: (input: unknown) => ({ key: 'board.members.list', input }) },
      },
      get: { queryFilter: (input: unknown) => ({ key: 'board.get', input }) },
    },
  }),
}));

import { BoardAccessRequestsSection } from './board-access-requests-section';

describe('<BoardAccessRequestsSection>', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.useMutation.mockReset();
    h.invalidateQueries.mockReset();
    h.approveMutate.mockReset();
    h.rejectMutate.mockReset();
    h.useQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        {
          id: 'req_1',
          boardId: 'b_1',
          requesterId: 'u_1',
          requesterName: 'Pusula Portal',
          requesterEmail: 'pusulaportal@gmail.com',
          message: null,
          status: 'pending',
          createdAt: new Date('2026-05-14T10:00:00Z'),
        },
      ],
    });
    h.useMutation.mockImplementation(
      (options: { key?: string; onSuccess?: () => Promise<void> }) => ({
        mutate: options.key === 'approve' ? h.approveMutate : h.rejectMutate,
        reset: vi.fn(),
        isPending: false,
        isError: false,
        error: null,
      }),
    );
  });

  it('lists pending requests and approves the selected board role', async () => {
    const user = userEvent.setup();
    render(<BoardAccessRequestsSection boardId="b_1" canManage />);

    expect(screen.getByText('Pusula Portal')).toBeInTheDocument();
    expect(screen.getByText('pusulaportal@gmail.com')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Onay rolü' }));
    await user.click(screen.getByRole('option', { name: 'İzleyici' }));
    await user.click(screen.getByRole('button', { name: 'Onayla' }));

    expect(h.approveMutate).toHaveBeenCalledWith({
      boardId: 'b_1',
      requestId: 'req_1',
      role: 'viewer',
      clientMutationId: expect.any(String),
    });
  });

  it('rejects a pending request', async () => {
    const user = userEvent.setup();
    render(<BoardAccessRequestsSection boardId="b_1" canManage />);

    await user.click(screen.getByRole('button', { name: 'Reddet' }));

    expect(h.rejectMutate).toHaveBeenCalledWith({
      boardId: 'b_1',
      requestId: 'req_1',
      clientMutationId: expect.any(String),
    });
  });

  it('invalidates request list, member list, and board cache after approve', async () => {
    h.useMutation.mockImplementation(
      (options: { key?: string; onSuccess?: () => Promise<void> }) => ({
        mutate: async () => {
          await options.onSuccess?.();
        },
        reset: vi.fn(),
        isPending: false,
        isError: false,
        error: null,
      }),
    );
    const user = userEvent.setup();
    render(<BoardAccessRequestsSection boardId="b_1" canManage />);

    await user.click(screen.getByRole('button', { name: 'Onayla' }));

    await waitFor(() => expect(h.invalidateQueries).toHaveBeenCalledTimes(3));
  });
});
