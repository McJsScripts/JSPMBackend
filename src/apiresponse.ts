export type APIResponseBody<OK extends boolean, T extends Record<string, any>> = {
	success: OK;
} & (OK extends false ? { error: string } : T);

export type CheckAPIResponse<OK extends boolean> = APIResponseBody<OK, {
	packageCount: number;
	size: number;
	packageNames: string[];
}>;

export type PKGPublishAPIResponse<OK extends boolean> = APIResponseBody<OK, {
	githubUrl: string;
}>;

export type PKGGetMetadataResponse<OK extends boolean> = APIResponseBody<OK, {
	url: string;
	content: string;
}>;

export type AuthGetNonceResponse<OK extends boolean> = APIResponseBody<OK, {
	username: string;
	nonce: string;
	expireIn?: number;
}>;

export type AuthPutTokenResponse<OK extends boolean> = APIResponseBody<OK, {
	token: string;
	expireIn?: number;
}>;
