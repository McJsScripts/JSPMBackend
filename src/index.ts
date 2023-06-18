import express, { Response } from "express";
import { APIResponseBody, CheckAPIResponse } from "./apiresponse";

const app = express();
app.use(express.json());

function sendResponse<T extends APIResponseBody<boolean, Record<string, any>>>(res: Response, obj: T) {
	res.send({...obj});
}

app.get("/", (_req, res) => {
	sendResponse<CheckAPIResponse<true>>(res, {
		time: 0, success: true,
		allOK: true, packageCount: 0
	});
});

app.listen(process.env.PORT || 3030, () => {
	console.log(`api server listening on port ${process.env.PORT || 3030}`);
});
