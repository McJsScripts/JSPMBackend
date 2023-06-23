import fs from "fs";
import path from "path";
console.log(__dirname);
console.log(fs.readdirSync(path.resolve(__dirname)))
console.log(fs.readdirSync(path.resolve(__dirname, "../../")))

import express, { Response } from "express";
import AdmZip from "adm-zip";

import { APIResponseBody, AuthGetNonceResponse, AuthPutTokenResponse, CheckAPIResponse, PKGGetMetadataResponse, PKGPublishAPIResponse } from "./apiresponse";
import promiseGitmanager, { githubMiddleware, isManagerReady } from "./gitmanager";
import { isPackageNameValid, jspmJsonSchema, requestGetPKGMetadata, requestPutToken, verifyMcUUID, verifyNonce } from "./schemas";
import { getNonce, getToken, putNonce, putToken } from "./dbmanager";

const app = express();
app.use(express.raw({
	type: "text/plain"
}));
app.use(express.urlencoded());
app.use(express.json());
app.use(async (req, res, next) =>  githubMiddleware(req, res, next));

function sendResponse<T extends APIResponseBody<boolean, Record<string, any>>>(res: Response, objOrError: T["success"] extends false ? string : T) {
	res.send(typeof objOrError === "string" ? { success: false, error: `${objOrError}` } : objOrError);
}

(async()=>{
	const gitmanager = await promiseGitmanager;
	isManagerReady(gitmanager);

	app.get("/", async (_req, res) => {
		const data = await gitmanager.checkRepo();
		if (!data) return sendResponse<CheckAPIResponse<false>>(res, "Could not check repository!");
		sendResponse<CheckAPIResponse<true>>(res, {
			success: true, ...data
		});
	});

	app.get("/pkg/:name", async (req, res) => {
		try {
			const params = requestGetPKGMetadata.parse(req.params);
			const data = await gitmanager.getPackageMetadata(params.name);
			if (!data) return sendResponse<PKGGetMetadataResponse<false>>(res, "Does not exist!");
			sendResponse<PKGGetMetadataResponse<true>>(res, {
				success: true, ...data
			});
		} catch (e) {
			sendResponse<PKGGetMetadataResponse<false>>(res, `${e}`);
		}
	});

	app.post("/pkg/:name", async (req, res) => {
		console.log("POST pkg", req.params.name, req.headers.authorization);
		try {
			const token = req.headers.authorization;
			if (!token) throw "Missing authorization header!";
			const name = req.params.name;
			if (!isPackageNameValid(name)) throw "Invalid name!";
			if (!Buffer.isBuffer(req.body)) throw "Request body must be a zip file!";
			const zip = new AdmZip(req.body);
			const cfg = jspmJsonSchema.parse(JSON.parse(zip.readAsText("jspm.json")));
			if ((await getToken(cfg.author.uuid)) !== token) throw "Invalid token!";
			if (!zip.getEntries().find(entry => entry.name === "index.js")) throw "Missing index.js file at root of package";
			const files = zip.getEntries().map(entry => ({ path: entry.entryName, content: entry.getData() }))
			await gitmanager.uploadPackage(name, files);
			sendResponse<PKGPublishAPIResponse<true>>(res, {
				success: true, githubUrl: `https://github.com/McJsScripts/JSPMRegistry/packages/${name}/`
			});
		} catch (e) {
			console.log("failed", e);
			sendResponse<PKGPublishAPIResponse<false>>(res, `${e}`);
		}
	});

	app.get("/auth/getnonce/:uuid", async (req, res) => {
		console.log("getnonce", req.params.uuid);
		try {
			const username = await verifyMcUUID(req.params.uuid);
			const { nonce, expireIn } = await putNonce(req.params.uuid);
			sendResponse<AuthGetNonceResponse<true>>(res, {
				success: true, nonce, username, expireIn
			});
		} catch (e) {
			console.log("failed", e);
			sendResponse<AuthGetNonceResponse<false>>(res, `${e}`);
		}
	});

	app.post("/auth/puttoken/:uuid", async (req, res) => {
		console.log("puttoken", req.params.uuid, req.body);
		try {
			const { nonce: nonce2 } = requestPutToken.parse(req.body);
			const nonce1 = await getNonce(req.params.uuid);
			if (!nonce1) throw "no";
			const username = await verifyMcUUID(req.params.uuid);
			verifyNonce(username, nonce1, nonce2);
			const { token, expireIn } = await putToken(req.params.uuid, nonce2);
			sendResponse<AuthPutTokenResponse<true>>(res, {
				success: true, token, expireIn
			});
		} catch (e) {
			console.log("failed", e);
			sendResponse<AuthPutTokenResponse<false>>(res, `${e}`);
		}
	});

	app.listen(process.env.PORT || 3030, () => {
		console.log(`api server listening on port ${process.env.PORT || 3030}`);
	});

})();
