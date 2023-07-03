import { App, createNodeMiddleware } from "@octokit/app";
import { isPackageNameValid } from "./schemas";

const GH_BOT_KEY = Buffer.from(process.env.GH_BOT_KEY!, "base64").toString();
const GH_BOT_SECRET = process.env.GH_BOT_SECRET!;

const REPOSITORY_NAME = "JSPMRegistry";
const OWNER_NAME = "McJsScripts";
const CONTENTS_URL = "/repos/{owner}/{repo}/contents/{path}";
const MASTER_BRANCH_URL = "/repos/{owner}/{repo}/branches/{branch}"
const GIT_BLOBS_URL = "/repos/{owner}/{repo}/git/blobs";
const GIT_TREE_URL = "/repos/{owner}/{repo}/git/trees";
const GIT_COMMITS_URL = "/repos/{owner}/{repo}/git/commits";

export const BLACKLIST_FILE = "blacklist.json";
export const PACKAGES_PATH = "packages";
export const PACKAGE_CONFIG_FILE = "jspm.json";
export const PACKAGE_ENTRY__FILE = "index.js";

const app = new App({
	appId: 349381,
	privateKey: GH_BOT_KEY,
	oauth: {
		clientId: "Iv1.a7bdf6fb5b125de1",
		clientSecret: GH_BOT_SECRET,
	},
	log: {
		info: console.log, warn: console.warn, debug: console.debug, error: console.error
	},
	webhooks: {
		secret: "silly webhook xd"
	}
});

const manager = (async()=>{for await (const { installation } of app.eachInstallation.iterator()) for await (const { octokit, repository } of app.eachRepository.iterator({ installationId: installation.id })) {
	console.log(`found ${repository.full_name}`);
	if (repository.full_name !== `${OWNER_NAME}/${REPOSITORY_NAME}`) continue;
	const obj = {
		checkRepo: async () => {
			const { data } = await octokit.request(`GET ${CONTENTS_URL}`, {
				owner: OWNER_NAME, repo: REPOSITORY_NAME, path: PACKAGES_PATH
			});
			if (!Array.isArray(data)) return null;
			let packageCount = 0;
			let size = 0;
			const packageNames = [];
			for (const node of data) {
				if (node.type !== "dir" || !isPackageNameValid(node.name)) continue;
				packageNames.push(node.name);
				size += node.size;
				packageCount++;
			}
			return { packageCount, size, packageNames }
		},
		getPackageMetadata: async (name: string) => {
			const { data } = await octokit.request(`GET ${CONTENTS_URL}`, {
				owner: OWNER_NAME, repo: REPOSITORY_NAME, path: `${PACKAGES_PATH}/${name}/${PACKAGE_CONFIG_FILE}`
			});
			if (Array.isArray(data) || data.type !== "file") return null;
			return { content: data.content, url: data.url }
		},
		uploadPackage: async (name: string, update: boolean, files: { path: string, content: Buffer}[]) => {
			if (!isPackageNameValid(name)) return null;
			try {
				if (!update) if ((await obj.checkRepo())?.packageNames.includes(name)) throw "Package already exists!";
				const { data: { commit: { sha: lastCommitSha } } } = await octokit.request(`GET ${MASTER_BRANCH_URL}`, {
					owner: OWNER_NAME, repo: REPOSITORY_NAME, branch: "master"
				});
				const blobs = await Promise.all(files.map(async f => {
					const { status, data: { sha: blobSha } } = await octokit.request(`POST ${GIT_BLOBS_URL}`, {
						owner: OWNER_NAME, repo: REPOSITORY_NAME, encoding: "base64", content: f.content.toString("base64")
					});
					if (status !== 201) throw `Error whilst creating blob (responded with ${status})`;
					return { path: f.path, sha: blobSha }
				}));
				const { data: { sha: treeSha } } = await octokit.request(`POST ${GIT_TREE_URL}`, {
					owner: OWNER_NAME, repo: REPOSITORY_NAME, base_tree: lastCommitSha, tree: blobs.map(b => ({
						type: "blob" as const, mode: "100644" as const, path: `${PACKAGES_PATH}/${name}/${b.path}`, sha: b.sha
					})),
				});
				const {  data: { sha: newCommitSha } } = await octokit.request(`POST ${GIT_COMMITS_URL}`, {
					owner: OWNER_NAME, repo: REPOSITORY_NAME, tree: treeSha, parents: [lastCommitSha], message: `(JSPM): ${!update ? `upload new pkg "${name}"` : `update pkg "${name}"`}`
				});
				await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}", {
					owner: OWNER_NAME, repo: REPOSITORY_NAME, sha: newCommitSha, branch: "master"
				});
			} catch (e) {
				return new Error(`${e}`);
			}
		},
		getBlacklist: async () => {
			const { data } = await octokit.request(`GET ${CONTENTS_URL}`, {
				owner: OWNER_NAME, repo: REPOSITORY_NAME, path: `${BLACKLIST_FILE}`
			});
			if (Array.isArray(data) || data.type !== "file") return [];
			const contents: string[] = JSON.parse(Buffer.from(data.content, "base64").toString());
			return contents;
		}
	} as const;
	return obj;
}})();
export default manager;

export function isManagerReady(m: Awaited<typeof manager>): asserts m is Exclude<Awaited<typeof manager>, undefined> {
	if (!manager || !m) throw new Error("Git manager is not ready.");
}

export const githubMiddleware = createNodeMiddleware(app);
