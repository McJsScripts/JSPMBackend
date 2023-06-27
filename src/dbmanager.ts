import { Deta } from "deta";
import { createHash } from "crypto";
const deta = Deta();

const noncedb = deta.Base("noncedb");
const tokendb = deta.Base("logindb");

const NONCE_EXPIRATION_TIME = 10;
const TOKEN_EXPIRATION_TIME = 60*60;

function hashHex(s: string) {
	return createHash("sha256").update(`${s}`).digest("hex");
}

function hashBase64(s: string) {
	return createHash("sha256").update(`${s}`).digest("base64");
}

export function hash2Nonces(nonce1: string, nonce2: string) {
	return hashHex(`${nonce1}+${nonce2}`).substring(0, 40);
}

export async function putNonce(uuid: string) {
	const check = await getNonce(uuid);
	if (check) return { nonce: check.value, expireIn: check.expireIn };
	if (!/(?=.*)\d+(?=.*)/.test(uuid)) throw "Invalid UUID!";
	const rand1 = uuid.match(/(?=.*)\d+(?=.*)/)!.map(m => m).join("");
	const nonce = hashHex(`${rand1}${new Date().getTime()}`);
	const { __expires } = await noncedb.put(nonce, `AUTH ${uuid}`, { expireIn: NONCE_EXPIRATION_TIME })! as { __expires: number };
	return { nonce, expireIn: __expires };
}

export async function getNonce(uuid: string) {
	const { value, __expires } = await noncedb.get(`AUTH ${uuid}`)! as { __expires: number, value: string };
	return { value, expireIn: __expires };
}

export async function putToken(uuid: string, nonce: string) {
	const check = await getToken(uuid);
	if (check) return { token: check.value, expireIn: check.expireIn };
	if ((await noncedb.get(`AUTH ${uuid}`))?.value === nonce) throw "Invalid nonce!";
	const token = hashBase64(`${nonce}+${new Date().getTime()}`);
	const { __expires } = await tokendb.put(token, `TOKEN ${uuid}`, { expireIn: TOKEN_EXPIRATION_TIME })! as { __expires: number };
	return { token, expireIn: __expires }
}

export async function getToken(uuid: string) {
	const { value, __expires } = await tokendb.get(`TOKEN ${uuid}`)! as { __expires: number, value: string };
	return { value, expireIn: __expires };
}
