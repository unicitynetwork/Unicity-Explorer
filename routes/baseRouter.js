"use strict";

const debug = require("debug");
const debugLog = debug("btcexp:router");

const express = require('express');
const csrfApi = require('csurf');
const router = express.Router();
const util = require('util');
const moment = require('moment');
const qrcode = require('qrcode');
const bitcoinjs = require('bitcoinjs-lib');
const bip32 = require('bip32');
const bs58check = require('bs58check');
const { bech32, bech32m } = require("bech32");
const sha256 = require("crypto-js/sha256");
const hexEnc = require("crypto-js/enc-hex");
const Decimal = require("decimal.js");
const semver = require("semver");
const markdown = require("markdown-it")();
const asyncHandler = require("express-async-handler");

const utils = require('./../app/utils.js');
const coins = require("./../app/coins.js");
const config = require("./../app/config.js");
const coreApi = require("./../app/api/coreApi.js");
const rpcApi = require("./../app/api/rpcApi.js");


const forceCsrf = csrfApi({ ignoreMethods: [] });

let noTxIndexMsg = "\n\nYour node does not have **txindex** enabled. Without it, you can only lookup wallet, mempool, and recently confirmed transactions by their **txid**. Searching for non-wallet transactions that were confirmed more than "+config.noTxIndexSearchDepth+" blocks ago is only possible if the confirmed block height is available.";

router.get("/", asyncHandler(async (req, res, next) => {
	try {
		if (req.session.host == null || req.session.host.trim() == "") {
			if (req.cookies['rpc-host']) {
				res.locals.host = req.cookies['rpc-host'];
			}

			if (req.cookies['rpc-port']) {
				res.locals.port = req.cookies['rpc-port'];
			}

			if (req.cookies['rpc-username']) {
				res.locals.username = req.cookies['rpc-username'];
			}

			res.render("connect");
			res.end();

			return;
		}

		const { perfId, perfResults } = utils.perfLogNewItem({action:"homepage"});
		res.locals.perfId = perfId;

		res.locals.homepage = true;
		
		// don't need timestamp on homepage "blocks-list", this flag disables
		res.locals.hideTimestampColumn = true;


		// variables used by blocks-list.pug
		res.locals.offset = 0;
		res.locals.sort = "desc";

		let feeConfTargets = [1, 6, 144, 1008];
		res.locals.feeConfTargets = feeConfTargets;


		let promises = [];

		promises.push(utils.timePromise("homepage.getMempoolInfo", async () => {
			res.locals.mempoolInfo = await coreApi.getMempoolInfo();
		}, perfResults));

		promises.push(utils.timePromise("homepage.getMiningInfo", async () => {
			res.locals.miningInfo = await coreApi.getMiningInfo();
		}, perfResults));

		promises.push(utils.timePromise("homepage.getSmartFeeEstimates", async () => {
			const rawSmartFeeEstimates = await coreApi.getSmartFeeEstimates("CONSERVATIVE", feeConfTargets);

			let smartFeeEstimates = {};

			for (let i = 0; i < feeConfTargets.length; i++) {
				let rawSmartFeeEstimate = rawSmartFeeEstimates[i];

				if (rawSmartFeeEstimate.errors) {
					smartFeeEstimates[feeConfTargets[i]] = "?";

				} else {
					smartFeeEstimates[feeConfTargets[i]] = parseInt(new Decimal(rawSmartFeeEstimate.feerate).times(coinConfig.baseCurrencyUnit.multiplier).dividedBy(1000));
				}
			}

			res.locals.smartFeeEstimates = smartFeeEstimates;
		}, perfResults));

		promises.push(utils.timePromise("homepage.getNetworkHashrate", async () => {
			res.locals.hashrate7d = await coreApi.getNetworkHashrate(1008);
		}, perfResults));

		promises.push(utils.timePromise("homepage.getNetworkHashrate", async () => {
			res.locals.hashrate30d = await coreApi.getNetworkHashrate(4320);
		}, perfResults));



		const getblockchaininfo = await utils.timePromise("homepage.getBlockchainInfo", async () => {
			return await coreApi.getBlockchainInfo();
		}, perfResults);


		res.locals.getblockchaininfo = getblockchaininfo;

		res.locals.difficultyPeriod = parseInt(Math.floor(getblockchaininfo.blocks / coinConfig.difficultyAdjustmentBlockCount));
			

		let blockHeights = [];
		if (getblockchaininfo.blocks) {

			const currentHeight = getblockchaininfo.blocks;
			// +1 to page size here so we have the next block to calculate T.T.M.
			for (let i = 0; i < (config.site.homepage.recentBlocksCount + 1); i++) {
				blockHeights.push(getblockchaininfo.blocks - i);
			}
			// Add boundary blocks needed for averages
			blockHeights.push(currentHeight - 5);
			blockHeights.push(currentHeight - 20);
			blockHeights.push(currentHeight - 100);
			blockHeights.push(currentHeight - 1000);

		} 

		promises.push(utils.timePromise("homepage.getBlocksStatsByHeight", async () => {
			const rawblockstats = await coreApi.getBlocksStatsByHeight(blockHeights);

			if (rawblockstats && rawblockstats.length > 0 && rawblockstats[0] != null) {
				res.locals.blockstatsByHeight = {};

				for (let i = 0; i < rawblockstats.length; i++) {
					let blockstats = rawblockstats[i];

					res.locals.blockstatsByHeight[blockstats.height] = blockstats;
				}
			}
		}, perfResults));

		promises.push(utils.timePromise("homepage.getBlockHeaderByHeight", async () => {
			let h = coinConfig.difficultyAdjustmentBlockCount * res.locals.difficultyPeriod;
			res.locals.difficultyPeriodFirstBlockHeader = await coreApi.getBlockHeaderByHeight(h);
		}, perfResults));

		
		promises.push(utils.timePromise("homepage.getBlocksByHeight", async () => {
			const blocks = await coreApi.getBlocksByHeight(blockHeights);
			
			// Store blocks by height for easy lookup
			const blocksByHeight = {};
			blocks.forEach(block => {
				blocksByHeight[block.height] = block;
			});
			
			res.locals.latestBlocks = blocks.slice(0, config.site.homepage.recentBlocksCount + 1);
			res.locals.blocksUntilDifficultyAdjustment = ((res.locals.difficultyPeriod + 1) * coinConfig.difficultyAdjustmentBlockCount) - blocks[0].height;

			// Calculate average times using boundary blocks
			const currentHeight = getblockchaininfo.blocks;
			const calculateAverage = (blockCount) => {
				const startBlock = blocksByHeight[currentHeight];
				const endBlock = blocksByHeight[currentHeight - blockCount];
				
				if (!startBlock || !endBlock) return null;
				
				const timeDiff = startBlock.time - endBlock.time;
				const average = timeDiff / blockCount;
				console.log("average", average);
				return average;
			};

			// Calculate and store average block times
			res.locals.averageBlockTimes = {
				last5: calculateAverage(5),
				last20: calculateAverage(20),
				last100: calculateAverage(100),
				last1000: calculateAverage(1000)
			};
		}, perfResults));

		
		let targetBlocksPerDay = 24 * 60 * 60 / global.coinConfig.targetBlockTimeSeconds;
		res.locals.targetBlocksPerDay = targetBlocksPerDay;


		await utils.awaitPromises(promises);



		let eraStartBlockHeader = res.locals.difficultyPeriodFirstBlockHeader;
		let currentBlock = res.locals.latestBlocks[0];

		res.locals.difficultyAdjustmentData = utils.difficultyAdjustmentEstimates(eraStartBlockHeader, currentBlock);

		res.locals.nextHalvingData = utils.nextHalvingEstimates(
			res.locals.difficultyPeriodFirstBlockHeader,
			res.locals.latestBlocks[0],
			res.locals.difficultyAdjustmentData);



		res.locals.perfResults = perfResults;


		await utils.timePromise("homepage.render", async () => {
			res.render("index");
		}, perfResults);

		next();

	} catch (err) {
		utils.logError("238023hw87gddd", err);
					
		res.locals.userMessage = "Error building page: " + err;

		await utils.timePromise("homepage.render", async () => {
			res.render("index");
		});

		next();
	}
}));

router.get("/node-details", asyncHandler(async (req, res, next) => {
	try {
		const { perfId, perfResults } = utils.perfLogNewItem({action:"node-details"});
		res.locals.perfId = perfId;

		const promises = [];

		promises.push(utils.timePromise("node-details.getBlockchainInfo", async () => {
			res.locals.getblockchaininfo = await coreApi.getBlockchainInfo();
		}, perfResults));

		promises.push(utils.timePromise("node-details.getDeploymentInfo", async () => {
			res.locals.getdeploymentinfo = await coreApi.getDeploymentInfo();
		}, perfResults));

		promises.push(utils.timePromise("node-details.getNetworkInfo", async () => {
			res.locals.getnetworkinfo = await coreApi.getNetworkInfo();
		}, perfResults));

		promises.push(utils.timePromise("node-details.getUptimeSeconds", async () => {
			res.locals.uptimeSeconds = await coreApi.getUptimeSeconds();
		}, perfResults));

		promises.push(utils.timePromise("node-details.getNetTotals", async () => {
			res.locals.getnettotals = await coreApi.getNetTotals();
		}, perfResults));


		await utils.awaitPromises(promises);


		res.locals.perfResults = perfResults;

		await utils.timePromise("node-details.render", async () => {
			res.render("node-details");
		}, perfResults);
		
		next();

	} catch (err) {
		utils.logError("32978efegdde", err);
					
		res.locals.userMessage = "Error building page: " + err;

		await utils.timePromise("node-details.render", async () => {
			res.render("node-details");
		});

		next();
	}
}));



router.get("/peers", asyncHandler(async (req, res, next) => {
	try {
		const { perfId, perfResults } = utils.perfLogNewItem({action:"peers"});
		res.locals.perfId = perfId;

		const promises = [];

		promises.push(utils.timePromise("peers.getPeerSummary", async () => {
			res.locals.peerSummary = await coreApi.getPeerSummary();
		}, perfResults));

		
		await utils.awaitPromises(promises);

		let peerSummary = res.locals.peerSummary;

		let peerIps = [];
		for (let i = 0; i < peerSummary.getpeerinfo.length; i++) {
			let ipWithPort = peerSummary.getpeerinfo[i].addr;
			if (ipWithPort.lastIndexOf(":") >= 0) {
				let ip = ipWithPort.substring(0, ipWithPort.lastIndexOf(":"));
				if (ip.trim().length > 0) {
					peerIps.push(ip.trim());
				}
			}
		}

		if (peerIps.length > 0) {
			res.locals.peerIpSummary = await utils.timePromise("peers.geoLocateIpAddresses", async () => {
				return await utils.geoLocateIpAddresses(peerIps)
			}, perfResults);
			
			res.locals.mapBoxComApiAccessKey = config.credentials.mapBoxComApiAccessKey;
		}


		await utils.timePromise("peers.render", async () => {
			res.render("peers");
		}, perfResults);

		next();

	} catch (err) {
		utils.logError("394rhweghe", err);
					
		res.locals.userMessage = "Error: " + err;

		await utils.timePromise("peers.render", async () => {
			res.render("peers");
		});

		next();
	}
}));

router.post("/connect", function(req, res, next) {
	let host = req.body.host;
	let port = req.body.port;
	let username = req.body.username;
	let password = req.body.password;

	res.cookie('rpc-host', host);
	res.cookie('rpc-port', port);
	res.cookie('rpc-username', username);

	req.session.host = host;
	req.session.port = port;
	req.session.username = username;

	let newClient = new bitcoinCore({
		host: host,
		port: port,
		username: username,
		password: password,
		timeout: 30000
	});

	debugLog("created new rpc client: " + newClient);

	global.rpcClient = newClient;

	req.session.userMessage = "<span class='font-weight-bold'>Connected via RPC</span>: " + username + " @ " + host + ":" + port;
	req.session.userMessageType = "success";

	res.redirect("/");
});

router.get("/disconnect", function(req, res, next) {
	res.cookie('rpc-host', "");
	res.cookie('rpc-port', "");
	res.cookie('rpc-username', "");

	req.session.host = "";
	req.session.port = "";
	req.session.username = "";

	debugLog("destroyed rpc client.");

	global.rpcClient = null;

	req.session.userMessage = "Disconnected from node.";
	req.session.userMessageType = "success";

	res.redirect("/");
});

router.get("/changeSetting", function(req, res, next) {
	if (req.query.name) {
		if (!req.session.userSettings) {
			req.session.userSettings = Object.create(null);
		}

		if (typeof req.query.name !== "string" || typeof req.query.value !== "string") {
			res.redirect(req.headers.referer);

			return;
		}

		if (req.query.name == "userTzOffset") {
			if (parseFloat(req.query.value) == NaN) {
				res.redirect(req.headers.referer);

				return;
			}
		}

		req.session.userSettings[req.query.name.toString()] = req.query.value.toString();

		let userSettings = JSON.parse(req.cookies["user-settings"] || "{}");
		userSettings[req.query.name] = req.query.value;

		res.cookie("user-settings", JSON.stringify(userSettings));
	}

	res.redirect(req.headers.referer);
});

router.get("/session-data", function(req, res, next) {
	if (req.query.action && req.query.data) {
		let action = req.query.action;
		let data = req.query.data;

		if (action == "add-rpc-favorite") {
			if (!req.session.favoriteRpcCommands) {
				req.session.favoriteRpcCommands = [];
			}

			if (!req.session.favoriteRpcCommands.includes(data)) {
				req.session.favoriteRpcCommands.push(data);
			}

			req.session.favoriteRpcCommands.sort();
		}

		if (action == "remove-rpc-favorite") {
			if (!req.session.favoriteRpcCommands) {
				req.session.favoriteRpcCommands = [];
			}

			if (req.session.favoriteRpcCommands.includes(data)) {
				req.session.favoriteRpcCommands.splice(req.session.favoriteRpcCommands.indexOf(data), 1);
			}
		}
	}

	res.redirect(req.headers.referer);
});

router.get("/user-settings", asyncHandler(async (req, res, next) => {
	await utils.timePromise("user-settings.render", async () => {
		res.render("user-settings");
	});

	next();
}));

router.get("/blocks", asyncHandler(async (req, res, next) => {
	try {
		const { perfId, perfResults } = utils.perfLogNewItem({action:"blocks"});
		res.locals.perfId = perfId;

		let limit = config.site.browseBlocksPageSize;
		let offset = 0;
		let sort = "desc";

		if (req.query.limit) {
			limit = parseInt(req.query.limit);
		}

		if (req.query.offset) {
			offset = parseInt(req.query.offset);
		}

		if (req.query.sort) {
			sort = req.query.sort;
		}

		res.locals.limit = limit;
		res.locals.offset = offset;
		res.locals.sort = sort;
		res.locals.paginationBaseUrl = "./blocks";

		// if pruning is active, global.pruneHeight is used when displaying this page
		// global.pruneHeight is updated whenever we send a getblockchaininfo RPC to the node

		let getblockchaininfo = await utils.timePromise("blocks.geoLocateIpAddresses", coreApi.getBlockchainInfo, perfResults);

		res.locals.blockCount = getblockchaininfo.blocks;
		res.locals.blockOffset = offset;

		let blockHeights = [];
		if (sort == "desc") {
			for (let i = (getblockchaininfo.blocks - offset); i > (getblockchaininfo.blocks - offset - limit - 1); i--) {
				if (i >= 0) {
					blockHeights.push(i);
				}
			}
		} else {
			for (let i = offset - 1; i < (offset + limit); i++) {
				if (i >= 0) {
					blockHeights.push(i);
				}
			}
		}

		blockHeights = blockHeights.filter((h) => {
			return h >= 0 && h <= getblockchaininfo.blocks;
		});


		let promises = [];

		promises.push(utils.timePromise("blocks.getBlocksByHeight", async () => {
			res.locals.blocks = await coreApi.getBlocksByHeight(blockHeights);
		}, perfResults));

		
		promises.push(utils.timePromise("blocks.getBlocksByHeight", async () => {
			try {
				let rawblockstats = await coreApi.getBlocksStatsByHeight(blockHeights);

				if (rawblockstats != null && rawblockstats.length > 0 && rawblockstats[0] != null) {
					res.locals.blockstatsByHeight = {};

					for (let i = 0; i < rawblockstats.length; i++) {
						let blockstats = rawblockstats[i];

						res.locals.blockstatsByHeight[blockstats.height] = blockstats;
					}
				}
			} catch (err) {
				if (!global.prunedBlockchain) {
					throw err;

				} else {
					// failure may be due to pruning, let it pass
					// TODO: be more discerning here...consider throwing something
				}
			}
		}, perfResults));


		await utils.awaitPromises(promises);

		await utils.timePromise("blocks.render", async () => {
			res.render("blocks");
		}, perfResults);

		next();

	} catch (err) {
		res.locals.pageErrors.push(utils.logError("32974hrbfbvc", err));

		res.locals.userMessage = "Error: " + err;

		await utils.timePromise("blocks.render", async () => {
			res.render("blocks");
		});

		next();
	}
}));





router.get("/block-stats", asyncHandler(async (req, res, next) => {
	if (semver.lt(global.btcNodeSemver, rpcApi.minRpcVersions.getblockstats)) {
		res.locals.rpcApiUnsupportedError = {rpc:"getblockstats", version:rpcApi.minRpcVersions.getblockstats};
	}

	try {
		const getblockchaininfo = await coreApi.getBlockchainInfo();
		res.locals.currentBlockHeight = getblockchaininfo.blocks;

		await utils.timePromise("block-stats.render", async () => {
			res.render("block-stats");
		});

		next();

	} catch(err) {
		res.locals.userMessage = "Error: " + err;

		await utils.timePromise("block-stats.render", async () => {
			res.render("block-stats");
		});

		next();
	};
}));



router.get("/search", function(req, res, next) {
	res.render("search");

	next();
});

router.post("/search", function(req, res, next) {
	if (!req.body.query) {
		req.session.userMessage = "Enter a block height, block hash, or transaction id.";

		res.redirect("./");

		return;
	}

	let query = req.body.query.toLowerCase().trim();
	let rawCaseQuery = req.body.query.trim();

	req.session.query = req.body.query;
	
	// xpub/ypub/zpub -> redirect: /xyzpub/XXX
	if (rawCaseQuery.match(/^(xpub|ypub|zpub|Ypub|Zpub).*$/)) {
		res.redirect(`./xyzpub/${rawCaseQuery}`);
		
		return;
	}

	// tpub/upub/vpub -> redirect: /xyzpub/XXX
	if (rawCaseQuery.match(/^(tpub|upub|vpub|Upub|Vpub).*$/)) {
		res.redirect(`./xyzpub/${rawCaseQuery}`);
		
		return;
	}
	
	
	// Support txid@height lookups
	if (/^[a-f0-9]{64}@\d+$/.test(query)) {
		return res.redirect("./tx/" + query);
	}

	//let parseAddressData = utils.tryParseAddress(rawCaseQuery);

	if (false) {
		if (parseAddressData.errors) {
			parseAddressData.errors.forEach(err => {
				utils.logError("19238rfehdusd", err, {address:query});
			});
		}
	}

	//if (parseAddressData.parsedAddress) {
	//	res.redirect("./address/" + rawCaseQuery);

	if (query.length == 64) {
		coreApi.getRawTransaction(query).then(function(tx) {
			res.redirect("./tx/" + query);

		}).catch(function(err) {
			coreApi.getBlockByHash(query).then(function(blockByHash) {
				res.redirect("./block/" + query);

			}).catch(function(err) {
				req.session.userMessage = "No results found for query: " + query;

				if (!global.txindexAvailable) {
					req.session.userMessage += noTxIndexMsg;
				}
				
				res.redirect("./");
			});
		});

	} else if (!isNaN(query)) {
		coreApi.getBlockByHeight(parseInt(query)).then(function(blockByHeight) {
			res.redirect("./block-height/" + query);
			
		}).catch(function(err) {
			req.session.userMessage = "No results found for query: " + query;

			res.redirect("./");
		});
	} else {
		req.session.userMessage = "No results found for query: " + rawCaseQuery;

		res.redirect("./");
	}
});

router.get("/block-height/:blockHeight", asyncHandler(async (req, res, next) => {
	try {
		const { perfId, perfResults } = utils.perfLogNewItem({action:"block-height"});
		res.locals.perfId = perfId;

		let blockHeight = parseInt(req.params.blockHeight);

		console.log("blockHeight", blockHeight);

		res.locals.blockHeight = blockHeight;

		res.locals.result = {};

		let limit = config.site.blockTxPageSize;
		let offset = 0;

		res.locals.maxTxOutputDisplayCount = 15;

		if (req.query.limit) {
			limit = parseInt(req.query.limit);

			// for demo sites, limit page sizes
			if (config.demoSite && limit > config.site.blockTxPageSize) {
				limit = config.site.blockTxPageSize;

				res.locals.userMessage = "Transaction page size limited to " + config.site.blockTxPageSize + ". If this is your site, you can change or disable this limit in the site config.";
			}
		}

		if (req.query.offset) {
			offset = parseInt(req.query.offset);
		}

		res.locals.limit = limit;
		res.locals.offset = offset;
		res.locals.paginationBaseUrl = "./block-height/" + blockHeight;


		const result = await utils.timePromise("block-height.getBlockByHeight", async () => {
			return await coreApi.getBlockByHeight(blockHeight);
		}, perfResults);

		res.locals.result.getblockbyheight = result;

		let promises = [];

		promises.push(utils.timePromise("block-height.getBlockByHashWithTransactions", async () => {
			const blockWithTransactions = await coreApi.getBlockByHashWithTransactions(result.hash, limit, offset);

			res.locals.result.getblock = blockWithTransactions.getblock;
			res.locals.result.transactions = blockWithTransactions.transactions;
			res.locals.result.txInputsByTransaction = blockWithTransactions.txInputsByTransaction;
		}, perfResults));

		promises.push(utils.timePromise("block-height.getBlockStats", async () => {
			try {
				const blockStats = await coreApi.getBlockStats(result.hash);
				
				res.locals.result.blockstats = blockStats;

			} catch (err) {
				if (global.prunedBlockchain) {
					// unavailable, likely due to pruning
					debugLog('Failed loading block stats', err);
					res.locals.result.blockstats = null;

				} else {
					throw err;
				}
			}
		}, perfResults));

		await utils.awaitPromises(promises);


		if (global.specialBlocks && global.specialBlocks[res.locals.result.getblock.hash]) {
			let funInfo = global.specialBlocks[res.locals.result.getblock.hash];

			res.locals.metaTitle = funInfo.summary;

			if (funInfo.alertBodyHtml) {
				res.locals.metaDesc = funInfo.alertBodyHtml.replace(/<\/?("[^"]*"|'[^']*'|[^>])*(>|$)/g, "");

			} else {
				res.locals.metaDesc = "";
			}
		} else {
			res.locals.metaTitle = `Bitcoin Block #${blockHeight.toLocaleString()}`;
			res.locals.metaDesc = "";
		}
		

		await utils.timePromise("block-height.render", async () => {
			res.render("block");
		}, perfResults);

		next();

	} catch (err) {
		res.locals.userMessageMarkdown = `Failed loading block: height=**${blockHeight}**`;

		res.locals.pageErrors.push(utils.logError("389wer07eghdd", err));

		await utils.timePromise("block-height.render", async () => {
			res.render("block");
		});

		next();
	}
}));

router.get("/block/:blockHash", asyncHandler(async (req, res, next) => {
	try {
		const { perfId, perfResults } = utils.perfLogNewItem({action:"block"});
		res.locals.perfId = perfId;

		console.log("blockHash", req.params.blockHash);

		let blockHash = utils.asHash(req.params.blockHash);

		res.locals.blockHash = blockHash;

		res.locals.result = {};

		let limit = config.site.blockTxPageSize;
		let offset = 0;

		res.locals.maxTxOutputDisplayCount = 15;

		if (req.query.limit) {
			limit = parseInt(req.query.limit);

			// for demo sites, limit page sizes
			if (config.demoSite && limit > config.site.blockTxPageSize) {
				limit = config.site.blockTxPageSize;

				res.locals.userMessage = "Transaction page size limited to " + config.site.blockTxPageSize + ". If this is your site, you can change or disable this limit in the site config.";
			}
		}

		if (req.query.offset) {
			offset = parseInt(req.query.offset);
		}

		res.locals.limit = limit;
		res.locals.offset = offset;
		res.locals.paginationBaseUrl = "./block/" + blockHash;

		let promises = [];

		promises.push(utils.timePromise("block.getBlockByHashWithTransactions", async () => {
			const blockWithTransactions = await coreApi.getBlockByHashWithTransactions(blockHash, limit, offset);

			res.locals.result.getblock = blockWithTransactions.getblock;
			res.locals.result.transactions = blockWithTransactions.transactions;
			res.locals.result.txInputsByTransaction = blockWithTransactions.txInputsByTransaction;
		}, perfResults));

		promises.push(utils.timePromise("block.getBlockStats", async () => {
			try {
				const blockStats = await coreApi.getBlockStats(blockHash);
				
				res.locals.result.blockstats = blockStats;

			} catch (err) {
				if (global.prunedBlockchain) {
					// unavailable, likely due to pruning
					debugLog('Failed loading block stats, likely due to pruning', err);

				} else {
					throw err;
				}
			}
		}, perfResults));

		await utils.awaitPromises(promises);


		if (global.specialBlocks && global.specialBlocks[res.locals.result.getblock.hash]) {
			let funInfo = global.specialBlocks[res.locals.result.getblock.hash];

			res.locals.metaTitle = funInfo.summary;

			if (funInfo.alertBodyHtml) {
				res.locals.metaDesc = funInfo.alertBodyHtml.replace(/<\/?("[^"]*"|'[^']*'|[^>])*(>|$)/g, "");

			} else {
				res.locals.metaDesc = "";
			}

		} else {
			res.locals.metaTitle = `Alpha Block ${utils.ellipsizeMiddle(res.locals.result.getblock.hash, 16)}`;
			res.locals.metaDesc = "";
		}

		
		await utils.timePromise("block.render", async () => {
			res.render("block");
		}, perfResults);

		next();

	} catch (err) {
		res.locals.userMessageMarkdown = `Failed to load block: **${blockHash}**`;

		res.locals.pageErrors.push(utils.logError("32824yhr2973t3d", err));

		await utils.timePromise("block.render", async () => {
			res.render("block");
		});

		next();
	}
}));


router.get("/block-analysis/:blockHashOrHeight", function(req, res, next) {
	let blockHashOrHeight = utils.asHashOrHeight(req.params.blockHashOrHeight);

	let goWithBlockHash = function(blockHash) {
		res.locals.blockHash = blockHash;

		res.locals.result = {};

		let txResults = [];

		let promises = [];

		res.locals.result = {};

		coreApi.getBlockByHash(blockHash).then(function(block) {
			res.locals.block = block;
			res.locals.result.getblock = block;

			res.render("block-analysis");

			next();

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("943h84ehedr", err));

			res.render("block-analysis");

			next();
		});
	};

	if (!isNaN(blockHashOrHeight)) {
		coreApi.getBlockByHeight(parseInt(blockHashOrHeight)).then(function(blockByHeight) {
			goWithBlockHash(blockByHeight.hash);
		});
	} else {
		goWithBlockHash(blockHashOrHeight);
	}
});

router.get("/block-analysis", function(req, res, next) {
	res.render("block-analysis-search");

	next();
});

router.get("/tx/:transactionId@:blockHeight", asyncHandler(async (req, res, next) => {
	req.query.blockHeight = req.params.blockHeight;
	req.url = "/tx/" + req.params.transactionId;

	next();
}));


router.get("/tx/:transactionId", asyncHandler(async (req, res, next) => {
	try {
		const { perfId, perfResults } = utils.perfLogNewItem({action:"transaction"});
		res.locals.perfId = perfId;

		let txid = utils.asHash(req.params.transactionId);

		let output = -1;
		if (req.query.output) {
			output = parseInt(req.query.output);
		}

		res.locals.txid = txid;
		res.locals.output = output;

		res.locals.maxTxOutputDisplayCount = 40;

		const promises = [];

		if (req.query.blockHeight) {
			res.locals.blockHeight = parseInt(req.query.blockHeight);
		}

		res.locals.result = {};

		let txInputLimit = (res.locals.crawlerBot) ? 3 : -1;

		let txPromise = req.query.blockHeight ? 
				async () => {
					const block = await coreApi.getBlockByHeight(parseInt(req.query.blockHeight));
					res.locals.block = block;
					return await coreApi.getRawTransactionsWithInputs([txid], txInputLimit, block.hash);
				}
				:
				async () => {
					return await coreApi.getRawTransactionsWithInputs([txid], txInputLimit);
				};

		const rawTxResult = await utils.timePromise("tx.getRawTransactionsWithInputs", txPromise, perfResults);

		let tx = rawTxResult.transactions[0];

		res.locals.tx = tx;
		res.locals.isCoinbaseTx = tx.vin[0].coinbase;
		console.log("tx Hello world", tx.vin[0].coinbase);		
		res.locals.result.getrawtransaction = tx;
		res.locals.result.txInputs = rawTxResult.txInputsByTransaction[txid] || {};


		promises.push(utils.timePromise("tx.getTxUtxos", async () => {
			res.locals.utxos = await coreApi.getTxUtxos(tx);
		}, perfResults));

		if (tx.confirmations == null) {
			promises.push(utils.timePromise("tx.getMempoolTxDetails", async () => {
				res.locals.mempoolDetails = await coreApi.getMempoolTxDetails(txid, true);

			}, perfResults));
			
		} else {
			promises.push(utils.timePromise("tx.getblockheader", async () => {
				let rpcResult = await rpcApi.getRpcDataWithParams({method:'getblockheader', parameters:[tx.blockhash]});
				res.locals.result.getblock = rpcResult;
			}, perfResults));
		}

		await utils.awaitPromises(promises);

		if (global.specialTransactions && global.specialTransactions[txid]) {
			let funInfo = global.specialTransactions[txid];

			res.locals.metaTitle = funInfo.summary;

			if (funInfo.alertBodyHtml) {
				res.locals.metaDesc = funInfo.alertBodyHtml.replace(/<\/?("[^"]*"|'[^']*'|[^>])*(>|$)/g, "");

			} else {
				res.locals.metaDesc = "";
			}
		} else {
			res.locals.metaTitle = `Bitcoin Transaction ${utils.ellipsizeMiddle(txid, 16)}`;
			res.locals.metaDesc = "";
		}

		res.locals.perfResults = perfResults;
		
		await utils.timePromise("tx.render", async () => {
			res.render("transaction");
		}, perfResults);

		next();

	} catch (err) {
		if (global.prunedBlockchain && res.locals.blockHeight && res.locals.blockHeight < global.pruneHeight) {
			// Failure to load tx here is expected and a full description of the situation is given to the user
			// in the UI. No need to also show an error userMessage here.

		} else if (!global.txindexAvailable) {
			res.locals.noTxIndexMsg = noTxIndexMsg;

			// As above, failure to load the tx is expected here and good user feedback is given in the UI.
			// No need for error userMessage.

		} else {
			res.locals.userMessageMarkdown = `Failed to load transaction: txid=**${txid}**`;
		}

		

		utils.logError("1237y4ewssgt", err);

		await utils.timePromise("tx.render", async () => {
			res.render("transaction");
		});

		next();
	}
}));



router.get("/next-halving", asyncHandler(async (req, res, next) => {
	try {
		const { perfId, perfResults } = utils.perfLogNewItem({action:"next-halving"});
		res.locals.perfId = perfId;

		const getblockchaininfo = await utils.timePromise("homepage.getBlockchainInfo", async () => {
			return await coreApi.getBlockchainInfo();
		}, perfResults);

		let promises = [];

		res.locals.getblockchaininfo = getblockchaininfo;
		res.locals.difficultyPeriod = parseInt(Math.floor(getblockchaininfo.blocks / coinConfig.difficultyAdjustmentBlockCount));

		let blockHeights = [];
		if (getblockchaininfo.blocks) {
			for (let i = 0; i < 1; i++) {
				blockHeights.push(getblockchaininfo.blocks - i);
			}
		} else if (global.activeBlockchain == "regtest") {
			// hack: default regtest node returns getblockchaininfo.blocks=0, despite
			// having a genesis block; hack this to display the genesis block
			blockHeights.push(0);
		}

		promises.push(utils.timePromise("homepage.getBlockHeaderByHeight", async () => {
			let h = coinConfig.difficultyAdjustmentBlockCount * res.locals.difficultyPeriod;
			res.locals.difficultyPeriodFirstBlockHeader = await coreApi.getBlockHeaderByHeight(h);
		}, perfResults));

		promises.push(utils.timePromise("homepage.getBlocksByHeight", async () => {
			const latestBlocks = await coreApi.getBlocksByHeight(blockHeights);
			
			res.locals.latestBlocks = latestBlocks;
		}));

		await utils.awaitPromises(promises);


		let nextHalvingData = utils.nextHalvingEstimates(res.locals.difficultyPeriodFirstBlockHeader, res.locals.latestBlocks[0]);

		res.locals.nextHalvingData = nextHalvingData;

		await utils.timePromise("next-halving.render", async () => {
			res.render("next-halving");
		}, perfResults);

		next();

	} catch (e) {
		res.locals.pageErrors.push(utils.logError("013923hege3", e));

		await utils.timePromise("next-halving.render", async () => {
			res.render("next-halving");
		});

		next();
	}
}));



router.get("/rpc-browser", asyncHandler(async (req, res, next) => {
	if (!config.demoSite && !req.authenticated) {
		res.send("RPC Terminal / Browser require authentication. Set an authentication password via the 'BTCEXP_BASIC_AUTH_PASSWORD' environment variable (see .env-sample file for more info).");

		next();

		return;
	}

	let method = "unknown";
	let argValues = [];

	try {
		const helpContent = await coreApi.getHelp();
		res.locals.gethelp = helpContent;


		if (req.query.method) {
			method = req.query.method;

			if (!req.session.recentRpcCommands) {
				req.session.recentRpcCommands = [];
			}

			if (!req.session.recentRpcCommands.includes(method)) {
				req.session.recentRpcCommands.unshift(method);
				
				while (req.session.recentRpcCommands.length > 5) {
					req.session.recentRpcCommands.pop();
				}
			}

			res.locals.method = req.query.method;

			const methodHelp = await coreApi.getRpcMethodHelp(req.query.method.trim());
			res.locals.methodhelp = methodHelp;

			if (req.query.execute) {
				let argDetails = methodHelp.args;
				
				if (req.query.args) {
					debugLog("ARGS: " + JSON.stringify(req.query.args));

					for (let i = 0; i < req.query.args.length; i++) {
						let argProperties = argDetails[i].properties;
						debugLog(`ARG_PROPS[${i}]: ` + JSON.stringify(argProperties));

						for (let j = 0; j < argProperties.length; j++) {
							if (argProperties[j] === "numeric") {
								if (req.query.args[i] == null || req.query.args[i] == "") {
									argValues.push(null);

								} else {
									argValues.push(parseInt(req.query.args[i]));
								}

								break;

							} else if (argProperties[j] === "boolean") {
								if (req.query.args[i]) {
									argValues.push(req.query.args[i] == "true");
								}

								break;

							} else if (argProperties[j] === "string") {
								if (req.query.args[i]) {
									argValues.push(req.query.args[i].replace(/[\r]/g, ''));
								}

								break;

							} else if (argProperties[j] === "numeric or string" || argProperties[j] === "string or numeric") {
								if (req.query.args[i]) {
									let stringVal = req.query.args[i].replace(/[\r]/g, '');
									let numberVal = parseInt(stringVal);

									if (numberVal.toString() == numberVal) {
										argValues.push(numberVal);

									} else {
										argValues.push(stringVal);
									}
								}

								break;

							} else if (argProperties[j] === "array" || argProperties[j] === "json array") {
								if (req.query.args[i]) {
									argValues.push(JSON.parse(req.query.args[i]));
								}
								
								break;

							} else if (argProperties[j] === "json object") {
								if (req.query.args[i]) {
									argValues.push(JSON.parse(req.query.args[i]));
								}
								
								break;

							} else {
								debugLog(`Unknown argument property: ${argProperties[j]}`);
							}
						}
					}
				}

				res.locals.argValues = argValues;

				if (config.rpcBlacklist.includes(req.query.method.toLowerCase())) {
					res.locals.methodResult = "Sorry, that RPC command is blacklisted. If this is your server, you may allow this command by removing it from the 'rpcBlacklist' setting in config.js.";

					res.render("rpc-browser");

					next();

					return;
				}

				//let csrfPromise = 

				await new Promise((resolve, reject) => {
					forceCsrf(req, res, async (err) => {
						if (err) {
							reject(err);

						} else {
							resolve();
						}
					});
				});

				debugLog("Executing RPC '" + req.query.method + "' with params: " + JSON.stringify(argValues));

				try {
					const startTimeNanos = utils.startTimeNanos();
					const rpcResult = await rpcApi.getRpcDataWithParams({method:req.query.method, parameters:argValues});
					const result = rpcResult;
					const dtMillis = utils.dtMillis(startTimeNanos);

					res.locals.executionMillis = dtMillis;

					debugLog("RPC Response: result=" + JSON.stringify(result));

					if (result) {
						res.locals.methodResult = result;

					} else {
						res.locals.methodResult = {"Error":"No response from node."};
					}

					//res.render("rpc-browser");

					//next();

				} catch (err) {
					res.locals.pageErrors.push(utils.logError("23roewuhfdghe", err, {method:req.query.method, params:argValues}));

					res.locals.methodResult = {error:("" + err)};

					//res.render("rpc-browser");

					//next();
				}

				/*forceCsrf(req, res, async (err) => {
					if (err) {
						return next(err);
					}

					
				});*/
			}
		}
	} catch (err) {
		res.locals.pageErrors.push(utils.logError("23ewyf0weee", err, {method:method, params:argValues}));
		
		res.locals.userMessage = "Error loading help content: " + err;
	}

	res.render("rpc-browser");

	next();
}));



router.get("/tx-stats", asyncHandler(async (req, res, next) => {
	const promises = [];
	const perfResults = {};

	res.locals.getblockchaininfo = await coreApi.getBlockchainInfo();
	let tipHeight = res.locals.getblockchaininfo.blocks;

	// only re-calculate tx-stats every X blocks since it's data heavy
	let heightInterval = 6;
	let height = heightInterval * Math.floor(tipHeight / heightInterval);

	promises.push(utils.timePromise("tx-stats.getTxStats-all", async () => {
		const statsAll = await coreApi.getTxStats(250, 0, height);

		res.locals.txStats = statsAll;
	}, perfResults));

	promises.push(utils.timePromise("tx-stats.getTxStats-day", async () => {
		const statsDay = await coreApi.getTxStats(144, height - 144*5, height);
		
		res.locals.txStatsDay = statsDay;
	}, perfResults));

	promises.push(utils.timePromise("tx-stats.getTxStats-week", async () => {
		const statsWeek = await coreApi.getTxStats(200, height - (144 * 7)*5, height);

		res.locals.txStatsWeek = statsWeek;
	}, perfResults));

	promises.push(utils.timePromise("tx-stats.getTxStats-month", async () => {
		const statsMonth = await coreApi.getTxStats(250, height - (144 * 30)*5, height);

		res.locals.txStatsMonth = statsMonth;
	}, perfResults));

//	promises.push(utils.timePromise("tx-stats.getTxStats-year", async () => {
//		const statsYear = await coreApi.getTxStats(250, height - (144 * 365)*5, height);

//		res.locals.txStatsYear = statsYear;
//	}, perfResults));


	await utils.awaitPromises(promises);

	res.render("tx-stats");

	next();
}));

router.get("/difficulty-history", function(req, res, next) {
	coreApi.getBlockchainInfo().then(function(getblockchaininfo) {
		res.locals.blockCount = getblockchaininfo.blocks;

		res.render("difficulty-history");

		next();

	}).catch(function(err) {
		res.locals.userMessage = "Error: " + err;

		res.render("difficulty-history");

		next();
	});
});

router.get("/utxo-set", function(req, res, next) {
	res.render("utxo-set");

	next();
});

router.get("/about", function(req, res, next) {
	res.render("about");

	next();
});

router.get("/tools", function(req, res, next) {
	res.render("tools");

	next();
});

router.get("/changelog", function(req, res, next) {
	res.locals.changelogHtml = markdown.render(global.changelogMarkdown);

	res.render("changelog");

	next();
});



module.exports = router;
