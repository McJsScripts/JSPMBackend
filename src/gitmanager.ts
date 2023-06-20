import { App, createNodeMiddleware } from "@octokit/app";

const GH_BOT_KEY = process.env.GH_BOT_KEY!;
const GH_BOT_SECRET = process.env.GH_BOT_SECRET!;

const REPOSITORY_NAME = "JSPMRegistry";
const OWNER_NAME = "McJsScripts";
const CONTENTS_URL = `/repos/{owner}/{repo}/contents/{path}`;

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

function isPackageNameValid(name: string): boolean {
	if (/[^-_a-z ]+/.test(name)) return false;
	return true;
}

const manager = (async()=>{for await (const { installation } of app.eachInstallation.iterator()) for await (const { octokit, repository } of app.eachRepository.iterator({ installationId: installation.id })) {
	console.log(`found ${repository.full_name}`);
	if (repository.full_name !== `${OWNER_NAME}/${REPOSITORY_NAME}`) continue;
	return {
		checkRepo: async () => {
			const { data } = await octokit.request(`GET ${CONTENTS_URL}`, {
				owner: OWNER_NAME, repo: REPOSITORY_NAME, path: PACKAGES_PATH
			});
			if (!Array.isArray(data)) return null;
			let packageCount = 0;
			let size = 0;
			for (const node of data) {
				if (node.type !== "dir" || !isPackageNameValid(node.name)) continue;
				packageCount++;
				size += node.size;
			}
			return { packageCount, size }
		},

	} as const;
}})();
export default manager;

export function isManagerReady(m: Awaited<typeof manager>): asserts m is Exclude<Awaited<typeof manager>, undefined> {
	if (!manager || !m) throw new Error("Git manager is not ready.");
}

export const githubMiddleware = createNodeMiddleware(app);
