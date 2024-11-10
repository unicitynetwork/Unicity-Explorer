"use strict";

const debug = require("debug");
const debugLog = debug("btcexp:router");

const express = require('express');
const router = express.Router();
const util = require('util');
const moment = require('moment');
const qrcode = require('qrcode');
const bitcoinjs = require('bitcoinjs-lib');
const sha256 = require("crypto-js/sha256");
const hexEnc = require("crypto-js/enc-hex");
const { bech32, bech32m } = require("bech32");
const Decimal = require("decimal.js");
const asyncHandler = require("express-async-handler");
const markdown = require("markdown-it")();

const coins = require("./../app/coins.js");
const config = require("./../app/config.js");
const utils = require('./../app/utils.js');
const coreApi = require("./../app/api/coreApi.js");
const rpcApi = require("./../app/api/rpcApi.js");
const apiDocs = require("./../docs/api.js");





router.get("/docs", function(req, res, next) {
	res.locals.apiDocs = apiDocs;
	res.locals.apiBaseUrl = apiDocs.baseUrl;
	res.locals.route = req.query.route;

	res.locals.categories = [];
	apiDocs.routes.forEach(x => {
		let category = x.category;

		if (!res.locals.categories.find(y => (y.name == category))) {
			res.locals.categories.push({name:category, items:[]});
		}

		res.locals.categories.find(x => (x.name == category)).items.push(x);
	});

	res.render("api-docs");

	next();
});

router.get("/changelog", function(req, res, next) {
	res.locals.changelogHtml = markdown.render(global.apiChangelogMarkdown);

	res.render("api-changelog");

	next();
});

router.get("/version", function(req, res, next) {
	res.send(apiDocs.version);

	next();
});

/// BLOCKS

router.get("/blocks/tip", asyncHandler(async (req, res, next) => {
	try {
		const getblockchaininfo = await coreApi.getBlockchainInfo();

		res.send({
			height: getblockchaininfo.blocks,
			hash: getblockchaininfo.bestblockhash
		});

	} catch (e) {
		utils.logError("a39gfoeuew", e);

		res.json({success: false});
	}

	next();
}));

router.get("/block/:hashOrHeight", asyncHandler(async (req, res, next) => {
	const hashOrHeight = req.params.hashOrHeight;
	let hash = (hashOrHeight.length == 64 ? hashOrHeight : null);

	try {

		if (hash == null) {
			hash = await coreApi.getBlockHashByHeight(parseInt(hashOrHeight));
		}

		const block = await coreApi.getBlockByHash(hash);

		res.json(block);

	} catch (e) {
		utils.logError("w9fgeddsuos", e);

		res.json({success: false});
	}

	next();
}));

router.get("/block/header/:hashOrHeight", asyncHandler(async (req, res, next) => {
	const hashOrHeight = req.params.hashOrHeight;
	let hash = (hashOrHeight.length == 64 ? hashOrHeight : null);

	try {
		if (hash == null) {
			hash = await coreApi.getBlockHashByHeight(parseInt(hashOrHeight));
		}

		const block = await coreApi.getBlockHeaderByHash(hash);

		res.json(block);

	} catch (e) {
		utils.logError("w8kwqpoauns", e);

		res.json({success: false});
	}

	next();
}));




/// TRANSACTIONS

router.get("/tx/:txid", asyncHandler(async (req, res, next) => {
	let txid = utils.asHash(req.params.txid);
	let promises = [];
	let txInputLimit = (res.locals.crawlerBot) ? 3 : -1;

	try {
		let results = await coreApi.getRawTransactionsWithInputs([txid], txInputLimit);
		let outJson = results.transactions[0];
		let txInputs = results.txInputsByTransaction[txid] || {};
		
		let inputBtc = 0;
		if (txInputs[0]) {
			for (let key in txInputs) {
				let item = txInputs[key];
				inputBtc += item["value"] * global.coinConfig.baseCurrencyUnit.multiplier;
				outJson.vin[key].scriptSig.address = item.scriptPubKey.address;
				outJson.vin[key].scriptSig.type = item.scriptPubKey.type;
				outJson.vin[key].value = item.value;
			}
		}
		
		let outputBtc = 0;
		for (let key in outJson.vout) {	
			let item = outJson.vout[key];			
			outputBtc += item.value * global.coinConfig.baseCurrencyUnit.multiplier;
		}

		outJson.fee = {
			"amount": (inputBtc - outputBtc) / global.coinConfig.baseCurrencyUnit.multiplier,
			"unit": "ALPHA"
		};

		if (outJson.confirmations == null) {
			outJson.mempool = await coreApi.getMempoolTxDetails(txid, false);		
		} 

		if (global.specialTransactions && global.specialTransactions[txid]) {
			let funInfo = global.specialTransactions[txid];
			outJson.fun = funInfo;
		}
		
		res.json(outJson);
		
	} catch(err) {
		utils.logError("10328fwgdaqw", err);
		res.json({success:false, error:err});
	}
	
	next();

}));

router.get("/tx/volume/24h", function(req, res, next) {
	try {
		if (networkVolume && networkVolume.d1 && networkVolume.d1.amt) {
			let currencyValue = parseInt(networkVolume.d1.amt);

			res.json({"24h": currencyValue});

		} else {
			res.json({success:false, error: "Volume data not yet loaded."});
		}

		next();

	} catch (err) {
		utils.logError("39024y484", err);

		res.json({success:false, error:err});
		
		next();
	}
});


/// BLOCKCHAIN

router.get("/blockchain/coins", asyncHandler(async (req, res, next) => {
	if (global.utxoSetSummary) {
		let supply = parseFloat(global.utxoSetSummary.total_amount).toString();

		res.send({
			supply: supply.toString(),
			type: "calculated"
		});

		next();

	} 
}));

router.get("/blockchain/utxo-set", asyncHandler(async (req, res, next) => {
	const utxoSetSummary = await coreApi.getUtxoSetSummary(true, true);
	
	res.json(utxoSetSummary);

	next();
}));

router.get("/blockchain/next-halving", asyncHandler(async (req, res, next) => {
	try {
		const getblockchaininfo = await coreApi.getBlockchainInfo();

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
		}));

		promises.push(utils.timePromise("homepage.getBlocksByHeight", async () => {
			const latestBlocks = await coreApi.getBlocksByHeight(blockHeights);
			
			res.locals.latestBlocks = latestBlocks;
		}));

		await utils.awaitPromises(promises);

		


		let nextHalvingData = utils.nextHalvingEstimates(res.locals.difficultyPeriodFirstBlockHeader, res.locals.latestBlocks[0]);

		// timeAgo =  moment.duration(moment.utc(new Date()).diff(moment.utc(new Date())));
		let timeAgo = moment.duration(moment.utc(nextHalvingData.nextHalvingDate).diff(moment.utc(new Date())));
		let format = timeAgo.format();
		let formatParts = format.split(",").map(x => x.trim());
		formatParts = formatParts.map(x => { return x.startsWith("0 ") ? "" : x; }).filter(x => x.length > 0);

		res.json({
			nextHalvingIndex: nextHalvingData.nextHalvingIndex,
			nextHalvingBlock: nextHalvingData.nextHalvingBlock,
			nextHalvingSubsidy: coinConfig.blockRewardFunction(nextHalvingData.nextHalvingBlock, global.activeBlockchain),
			blocksUntilNextHalving: nextHalvingData.blocksUntilNextHalving,
			timeUntilNextHalving: formatParts.join(", "),
			nextHalvingEstimatedDate: nextHalvingData.nextHalvingDate,
		});

		next();

	} catch (e) {
		utils.logError("013923hege3", e)
		
		res.json({success:false});

		next();
	}
}));



/// MINING

router.get("/mining/hashrate", asyncHandler(async (req, res, next) => {
	try {
		let decimals = 3;

		if (req.query.decimals) {
			decimals = parseInt(req.query.decimals);
		}

		let blocksPerDay = 24 * 60 * 60 / coinConfig.targetBlockTimeSeconds;
		let rates = [];

		let timePeriods = [
			1 * blocksPerDay,
			7 * blocksPerDay,
			30 * blocksPerDay,
			90 * blocksPerDay,
		];

		let promises = [];

		for (let i = 0; i < timePeriods.length; i++) {
			const index = i;
			const x = timePeriods[i];

			promises.push(new Promise(async (resolve, reject) => {
				try {
					const hashrate = await coreApi.getNetworkHashrate(x);
					let summary = utils.formatLargeNumber(hashrate, decimals);
					
					rates[index] = {
						val: parseFloat(summary[0]),

						unit: `${summary[1].name}hash`,
						unitAbbreviation: `${summary[1].abbreviation}H`,
						unitExponent: summary[1].exponent,
						unitMultiplier: summary[1].val,

						raw: summary[0] * summary[1].val,
						
						string1: `${summary[0]}x10^${summary[1].exponent}`,
						string2: `${summary[0]}e${summary[1].exponent}`,
						string3: `${(summary[0] * summary[1].val).toLocaleString()}`
					};

					resolve();

				} catch (ex) {
					utils.logError("8ehfwe8ehe", ex);

					resolve();
				}
			}));
		}

		await Promise.all(promises);

		res.json({
			"1Day": rates[0],
			"7Day": rates[1],
			"30Day": rates[2],
			"90day": rates[3]
		});

	} catch (e) {
		utils.logError("23reuhd8uw92D", e);

		res.json({
			error: typeof(e) == "string" ? e : utils.stringifySimple(e)
		});
	}
}));

router.get("/mining/diff-adj-estimate", asyncHandler(async (req, res, next) => {
	const { perfId, perfResults } = utils.perfLogNewItem({action:"api.diff-adj-estimate"});
	res.locals.perfId = perfId;

	let promises = [];
	const getblockchaininfo = await utils.timePromise("api_diffAdjEst_getBlockchainInfo", coreApi.getBlockchainInfo);
	let currentBlock;
	let difficultyPeriod = parseInt(Math.floor(getblockchaininfo.blocks / coinConfig.difficultyAdjustmentBlockCount));
	let difficultyPeriodFirstBlockHeader;
	
	promises.push(utils.timePromise("api.diff-adj-est.getBlockHeaderByHeight", async () => {
		currentBlock = await coreApi.getBlockHeaderByHeight(getblockchaininfo.blocks);
	}, perfResults));
	
	promises.push(utils.timePromise("api.diff-adj-est.getBlockHeaderByHeight2", async () => {
		let h = coinConfig.difficultyAdjustmentBlockCount * difficultyPeriod;
		difficultyPeriodFirstBlockHeader = await coreApi.getBlockHeaderByHeight(h);
	}, perfResults));

	await utils.awaitPromises(promises);
	
	let firstBlockHeader = difficultyPeriodFirstBlockHeader;
	let heightDiff = currentBlock.height - firstBlockHeader.height;
	let blockCount = heightDiff + 1;
	let timeDiff = currentBlock.mediantime - firstBlockHeader.mediantime;
	let timePerBlock = timeDiff / heightDiff;
	let dt = new Date().getTime() / 1000 - firstBlockHeader.time;
	let predictedBlockCount = dt / coinConfig.targetBlockTimeSeconds;
	let timePerBlock2 = dt / heightDiff;

	let blockRatioPercent = new Decimal(blockCount / predictedBlockCount).times(100);
	if (blockRatioPercent > 400) {
		blockRatioPercent = new Decimal(400);
	}
	if (blockRatioPercent < 25) {
		blockRatioPercent = new Decimal(25);
	}
	
	let diffAdjPercent = 0;
	if (predictedBlockCount > blockCount) {
		diffAdjPercent = new Decimal(100).minus(blockRatioPercent).times(-1);
		//diffAdjPercent = diffAdjPercent * -1;

	} else {
		diffAdjPercent = blockRatioPercent.minus(new Decimal(100));
	}
	
	res.send(diffAdjPercent.toFixed(2).toString());
}));

















module.exports = router;
