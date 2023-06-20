export type APIResponseBody<OK extends boolean, T extends Record<string, any>> = {
	success: OK;
} & (OK extends false ? { error: string } : T);

export type CheckAPIResponse<OK extends boolean> = APIResponseBody<OK, {
	packageCount: number;
	size: number;
}>;
