import express, { Response } from "express";
import cors from "cors";
import AdmZip from "adm-zip";
import checkSemver from "semver/functions/gt";
import validateSemver from "semver/functions/valid";

import { APIResponseBody, AuthGetNonceResponse, AuthPutTokenResponse, CheckAPIResponse, PKGGetMetadataResponse, PKGPublishAPIResponse } from "./apiresponse";
import promiseGitmanager, { PACKAGE_CONFIG_FILE, githubMiddleware, isManagerReady } from "./gitmanager";
import { isPackageNameValid, jspmJsonSchema, requestGetPKGMetadata, requestPutToken, verifyMcUUID, verifyNonce } from "./schemas";
import { getNonce, getToken, putNonce, putToken } from "./dbmanager";
const rateLimiter = require("express-rate-limit");

const app = express();
app.use(cors());
app.use(express.raw({
	limit: "5000kb", verify(req) {
		req.setEncoding("binary");
	},
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(async (req, res, next) =>  githubMiddleware(req, res, next));
const RATE_LIMIT_MAX = 2;

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

	app.post("/pkg/:name", rateLimiter.default({ message: { success: false, error: "Too many requests!" }, windowMs: RATE_LIMIT_MAX }), async (req, res) => {
		console.log("(POST pkg)", req.params.name, req.headers.authorization, req.body.toString("base64"));
		try {
			const blacklist = await gitmanager.getBlacklist();

			const token = req.headers.authorization;
			if (!token) throw "Missing authorization header!";
			const name = req.params.name;

			if (!isPackageNameValid(name)) throw "Invalid name!";
			if (!Buffer.isBuffer(req.body)) throw "Request body must be a zip file!";
			const zip = new AdmZip(req.body);

			const cfg = jspmJsonSchema.parse(JSON.parse(zip.readAsText(PACKAGE_CONFIG_FILE)));
			if (blacklist.includes(cfg.author.uuid)) throw "Unauthorized. You'be been blacklisted!";
			if (cfg.private) throw "`private` is true!";
			if ((await verifyMcUUID(cfg.author.uuid)) !== cfg.author.name) throw "Invalid uuid!";
			if ((await getToken(cfg.author.uuid))?.value !== token) throw "Invalid token!";
			if (!validateSemver(cfg.version.pkg)) throw "Invalid package semver!";

			let update = false;

			const gitCheck = await gitmanager.checkRepo();
			if (!gitCheck) throw "Something went wrong (checkRepo failed)";
			if (gitCheck.packageNames.includes(name)) {
				const pkgCheck = await gitmanager.getPackageMetadata(name);
				if (!pkgCheck) throw "Something went wrong (couldn't fetch pkg metadata)";
				const cfgCheck = jspmJsonSchema.parse(JSON.parse(Buffer.from(pkgCheck.content, "base64").toString()));
				if ((await verifyMcUUID(cfgCheck.author.uuid)) !== cfg.author.name || (await getToken(cfgCheck.author.uuid))?.value !== token) throw "Unauthorized. Only the package publisher is able to update the package!";

				const gt = checkSemver(cfg.version.pkg, cfgCheck.version.pkg); // greather than
				if (!gt) throw "Downgrading a package `version.pkg` is not allowed!";

				update = true;
			}

			if (!zip.getEntries().find(entry => entry.name === "index.js")) throw "Missing index.js file at root of package";
			const files = zip.getEntries().map(entry => ({ path: entry.entryName, content: entry.getData() }))
			await gitmanager.uploadPackage(name, update, files);
			sendResponse<PKGPublishAPIResponse<true>>(res, {
				success: true, githubUrl: `https://github.com/McJsScripts/JSPMRegistry/packages/${name}/`
			});
		} catch (e) {
			console.log("(failed)", req.params.name, e);
			sendResponse<PKGPublishAPIResponse<false>>(res, `${e}`);
		}
	});

	app.get("/auth/getnonce/:uuid", async (req, res) => {
		console.log("(GET getnonce)", req.params.uuid);
		try {
			const username = await verifyMcUUID(req.params.uuid);
			const { nonce, expireIn } = await putNonce(req.params.uuid);
			sendResponse<AuthGetNonceResponse<true>>(res, {
				success: true, nonce, username, expireIn
			});
		} catch (e) {
			console.log("(failed)", req.params.uuid, e);
			sendResponse<AuthGetNonceResponse<false>>(res, `${e}`);
		}
	});

	app.post("/auth/puttoken/:uuid", async (req, res) => {
		console.log("(POST puttoken)", req.params.uuid, req.body);
		try {
			const { nonce: nonce2 } = requestPutToken.parse(req.body);
			const nonce1 = await getNonce(req.params.uuid);
			if (!nonce1?.value) throw "no";
			const username = await verifyMcUUID(req.params.uuid);
			verifyNonce(username, nonce1.value, nonce2);
			const { token, expireIn } = await putToken(req.params.uuid, nonce2);
			sendResponse<AuthPutTokenResponse<true>>(res, {
				success: true, token, expireIn
			});
		} catch (e) {
			console.log("(failed)", req.params.uuid, e);
			sendResponse<AuthPutTokenResponse<false>>(res, `${e}`);
		}
	});

	app.listen(process.env.PORT || 3030, () => {
		console.log(`api server listening on port ${process.env.PORT || 3030}`);
	});

})();
