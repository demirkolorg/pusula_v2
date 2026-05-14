import { describe, expect, it } from 'vitest';
import { createWorkspaceInput, updateWorkspaceInput } from './workspace';

describe('workspace icon inputs', () => {
  it('defaults new workspaces to the briefcase icon', () => {
    expect(createWorkspaceInput.parse({ name: 'Pazarlama' })).toEqual({
      name: 'Pazarlama',
      icon: 'briefcase',
    });
  });

  it('accepts selected icons while creating or updating a workspace', () => {
    expect(createWorkspaceInput.parse({ name: 'Pazarlama', icon: 'rocket' })).toEqual({
      name: 'Pazarlama',
      icon: 'rocket',
    });

    expect(updateWorkspaceInput.parse({ workspaceId: 'workspace_1', icon: 'target' })).toEqual({
      workspaceId: 'workspace_1',
      icon: 'target',
    });
  });

  it('rejects unknown workspace icons instead of silently stripping them', () => {
    expect(createWorkspaceInput.safeParse({ name: 'Pazarlama', icon: 'unknown' }).success).toBe(false);
    expect(updateWorkspaceInput.safeParse({ workspaceId: 'workspace_1', icon: 'unknown' }).success).toBe(false);
  });
});
