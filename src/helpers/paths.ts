import { resolvePath } from '@idlebox/node';
import { context } from '../main';

export const WORKTREE_FOLDER_NAME = 'worktree';
export const GITDIR_FOLDER_NAME = '../git';
export const CURRENT_DIRECTORY = context.globalStorageUri.fsPath;

export const WORKTREE_FULL_PATH = resolvePath(CURRENT_DIRECTORY, WORKTREE_FOLDER_NAME);
export const GITDIR_FULL_PATH = resolvePath(WORKTREE_FULL_PATH, GITDIR_FOLDER_NAME);
