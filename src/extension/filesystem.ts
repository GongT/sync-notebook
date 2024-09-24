type MayPromise<T> = PromiseLike<T> | T;
export interface IFileItemProperty {}
export interface IFileItem {
	readonly path: string;
	readonly properties: IFileItemProperty;
	readonly meta: any;
}

export interface IFilesystemProvider {
	startup(): MayPromise<void>;
	getFilelist(): Promise<readonly IFileItem[]>;
	openDocument(file: IFileItem): MayPromise<void>;
	dispose(): MayPromise<void>;
}
