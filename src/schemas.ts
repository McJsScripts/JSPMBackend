import z from "zod";
import { request } from "undici";
import { hash2Nonces } from "./dbmanager";

export const BAD_NAME_REGEXP = /[^-_a-z ]+/;
export const SEMVER_REGEXP = /^(?<MAJOR>0|(?:[1-9]\d*))\.(?<MINOR>0|(?:[1-9]\d*))\.(?<PATCH>0|(?:[1-9]\d*))(?:-(?<prerelease>(?:0|(?:[1-9A-Za-z-][0-9A-Za-z-]*))(?:\.(?:0|(?:[1-9A-Za-z-][0-9A-Za-z-]*)))*))?(?:\+(?<build>(?:0|(?:[1-9A-Za-z-][0-9A-Za-z-]*))(?:\.(?:0|(?:[1-9A-Za-z-][0-9A-Za-z-]*)))*))?$/;

export function isPackageNameValid(name: string) {
	return !BAD_NAME_REGEXP.test(name);
}

export async function verifyMcUUID(uuid: string) {
	z.string().uuid("Invalid UUID!").parse(uuid);
	const { name } = await (await request(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`)).body.json();
	if (typeof name !== "string") throw "Not a valid Minecraft UUID!";
	return name;
}

export async function verifyNonce(username: string, nonce1: string, nonce2: string) {
	try {
		const hash = hash2Nonces(nonce1, nonce2);
		const res = await (await request(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(username)}&serverId=${encodeURIComponent(hash)}`)).body.text();
			console.log(res);
		if (typeof res !== "object") throw "Invalid nonce!";
	} catch (e) { throw `${e}` }
}

export const jspmJsonSchema = z.object({
	author: z.object({
		name: z.string({ invalid_type_error: "`author.name` must be string!" }),
		uuid: z.string({ required_error: "Missing `author.uuid`!" }).uuid()
	}),
	version: z.object({
		pkg: z.string({ required_error: "Missing `version.pkg`!" }).regex(SEMVER_REGEXP, "`pkg.version` must be a semantic version!"),
		minecraft: z.string({ required_error: "Missing `version.minecraft`" }),
		jsscripts: z.string().optional(),
	}),
	displayName: z.string().optional(),
	description: z.string().optional(),
	tags: z.array(z.string()).optional(),
});

export const requestGetPKGMetadata = z.object({
	name: z.string().refine(isPackageNameValid, "Invalid name!"),
});

export const requestPutToken = z.object({
	nonce: z.string()
});
