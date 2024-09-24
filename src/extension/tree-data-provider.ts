import { basename } from 'node:path';
import vscode from 'vscode';
import { context } from '../main';

class TreeItem extends vscode.TreeItem {
	children: TreeItem[] | undefined;

	constructor(public override readonly id: string, children?: TreeItem[]) {
		super(basename(id), children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded);
		this.children = children;
	}
}

class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
	// private readonly fs: vscode.FileSystemProvider;
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | null>();
	onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor() {}

	async getTreeItem(element: TreeItem) {
		return element;
	}

	async getChildren(element?: TreeItem | undefined): Promise<TreeItem[] | undefined> {
		if (element) {
			return;
		}
		return;
	}
}

const view = vscode.window.createTreeView('gitanywhere.explorer', {
	treeDataProvider: new TreeDataProvider(),
	canSelectMany: true,
	// dragAndDropController,
	showCollapseAll: true,
});
context.subscriptions.push(view);
