import express, { Response } from "express";
import { APIResponseBody, CheckAPIResponse } from "./apiresponse";
import promiseGitmanager, { githubMiddleware, isManagerReady } from "./gitmanager";

const app = express();
app.use(express.json());
app.use(async (req, res, next) =>  githubMiddleware(req, res, next));

function sendResponse<T extends APIResponseBody<boolean, Record<string, any>>>(res: Response, obj: T) {
	res.send({...obj});
}

(async()=>{
	const gitmanager = await promiseGitmanager;
	isManagerReady(gitmanager);

	app.get("/", async (_req, res) => {
		const data = await gitmanager.checkRepo();
		if (!data) return sendResponse<CheckAPIResponse<false>>(res, {
			success: false, error: "Could not check repository!"
		});
		sendResponse<CheckAPIResponse<true>>(res, {
			success: true, ...data
		});
	});

	app.listen(process.env.PORT || 3030, () => {
		console.log(`api server listening on port ${process.env.PORT || 3030}`);
	})

})();
