"use strict";

const debug = require("debug");
const debugLog = debug("btcexp:config");

const fs = require('fs');
const crypto = require('crypto');
const url = require('url');
const path = require('path');

const apiDocs = require("../docs/api.js");

let baseUrl = (process.env.BTCEXP_BASEURL || "/").trim();
if (!baseUrl.startsWith("/")) {
	baseUrl = "/" + baseUrl;
}
if (!baseUrl.endsWith("/")) {
	baseUrl += "/";
}


let cdnBaseUrl = (process.env.BTCEXP_CDN_BASE_URL || ".").trim();
while (cdnBaseUrl.endsWith("/")) {
	cdnBaseUrl = cdnBaseUrl.substring(0, cdnBaseUrl.length - 1);
}

let s3BucketPath = (process.env.BTCEXP_S3_BUCKET_PATH || "").trim();
while (s3BucketPath.endsWith("/")) {
	s3BucketPath = s3BucketPath.substring(0, s3BucketPath.length - 1);
}


const coins = require("./coins.js");
const credentials = require("./credentials.js");

const currentCoin = process.env.BTCEXP_COIN || "ALPHA";

const rpcCred = credentials.rpc;


const cookieSecret = process.env.BTCEXP_COOKIE_SECRET
 || (rpcCred.password && crypto.createHmac('sha256', JSON.stringify(rpcCred))
                               .update('btc-rpc-explorer-cookie-secret').digest('hex'))
 || "0x000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f";
 


// const electrumServerUriStrings = (process.env.BTCEXP_ELECTRUM_SERVERS || process.env.BTCEXP_ELECTRUMX_SERVERS || "").split(',').filter(Boolean);
// const electrumServers = [];
// for (let i = 0; i < electrumServerUriStrings.length; i++) {
//   const uri = url.parse(electrumServerUriStrings[i]);
//   
//   electrumServers.push({protocol:uri.protocol.substring(0, uri.protocol.length - 1), host:uri.hostname, port:parseInt(uri.port)});
// }

// Configure static local Electrum server
const electrumServers = [
  // Standard TCP connection
  { protocol: 'tcp', host: '127.0.0.1', port: 50001 }
];

// default=false env vars
[
	"BTCEXP_DEMO",
	"BTCEXP_PRIVACY_MODE",
	"BTCEXP_NO_INMEMORY_RPC_CACHE",
	"BTCEXP_RPC_ALLOWALL",
	"BTCEXP_UI_HIDE_INFO_NOTES",

].forEach(function(item) {
	if (process.env[item] === undefined) {
		process.env[item] = "false";

		debugLog(`Config(default): ${item}=false`)
	}
});


// default=true env vars
[
	"BTCEXP_NO_RATES",
	"BTCEXP_SLOW_DEVICE_MODE"

].forEach(function(item) {
	if (process.env[item] === undefined) {
		process.env[item] = "true";

		debugLog(`Config(default): ${item}=true`)
	}
});

const slowDeviceMode = (process.env.BTCEXP_SLOW_DEVICE_MODE.toLowerCase() == "true");

module.exports = {
	host: process.env.BTCEXP_HOST || "127.0.0.1",
	port: process.env.PORT || process.env.BTCEXP_PORT || 3002,
	secureSite: process.env.BTCEXP_SECURE_SITE == "true",

	baseUrl: baseUrl,
	apiBaseUrl: apiDocs.baseUrl,
	
	// Set address API to use Electrum
	addressApi: "electrum",
	
	// Add electrumServers to exports
	electrumServers: electrumServers,

	coin: currentCoin,

	displayDefaults: {
		displayCurrency: (process.env.BTCEXP_DISPLAY_CURRENCY || "alpha"),
		localCurrency: (process.env.BTCEXP_LOCAL_CURRENCY || "usd"),
		theme: (process.env.BTCEXP_UI_THEME || "dark"),
		timezone: (process.env.BTCEXP_UI_TIMEZONE || "local")
	},

	cookieSecret: cookieSecret,

	privacyMode: (process.env.BTCEXP_PRIVACY_MODE.toLowerCase() == "true"),
	slowDeviceMode: slowDeviceMode,
	demoSite: (process.env.BTCEXP_DEMO.toLowerCase() == "true"),
	queryExchangeRates: (process.env.BTCEXP_NO_RATES.toLowerCase() != "true" && process.env.BTCEXP_PRIVACY_MODE.toLowerCase() != "true"),
	noInmemoryRpcCache: (process.env.BTCEXP_NO_INMEMORY_RPC_CACHE.toLowerCase() == "true"),
	
	rpcConcurrency: (process.env.BTCEXP_RPC_CONCURRENCY || (slowDeviceMode ? 3 : 10)),

	filesystemCacheDir: (process.env.BTCEXP_FILESYSTEM_CACHE_DIR || path.join(process.cwd(),"./cache")),

	noTxIndexSearchDepth: (+process.env.BTCEXP_NOTXINDEX_SEARCH_DEPTH || 3),

	cdn: {
		active: (cdnBaseUrl == "." ? false : true),
		s3Bucket: process.env.BTCEXP_S3_BUCKET,
		s3BucketRegion: process.env.BTCEXP_S3_BUCKET_REGION,
		s3BucketPath: s3BucketPath,
		baseUrl: cdnBaseUrl
	},

	rpcBlacklist:
		process.env.BTCEXP_RPC_ALLOWALL.toLowerCase() == "true"  ? []
		: process.env.BTCEXP_RPC_BLACKLIST ? process.env.BTCEXP_RPC_BLACKLIST.split(',').filter(Boolean)
		: [
		"addnode",
		"backupwallet",
		"bumpfee",
		"clearbanned",
		"createmultisig",
		"createwallet",
		"disconnectnode",
		"dumpprivkey",
		"dumpwallet",
		"encryptwallet",
		"generate",
		"generatetoaddress",
		"getaccountaddrss",
		"getaddressesbyaccount",
		"getnewaddress",
		"getrawchangeaddress",
		"getreceivedbyaccount",
		"getreceivedbyaddress",
		"gettransaction",
		"getunconfirmedbalance",
		"getwalletinfo",
		"importaddress",
		"importmulti",
		"importprivkey",
		"importprunedfunds",
		"importpubkey",
		"importwallet",
		"invalidateblock",
		"keypoolrefill",
		"listaccounts",
		"listaddressgroupings",
		"listlockunspent",
		"listreceivedbyaccount",
		"listreceivedbyaddress",
		"listsinceblock",
		"listtransactions",
		"listunspent",
		"listwallets",
		"lockunspent",
		"logging",
		"move",
		"preciousblock",
		"pruneblockchain",
		"reconsiderblock",
		"removeprunedfunds",
		"rescanblockchain",
		"savemempool",
		"sendfrom",
		"sendmany",
		"sendtoaddress",
		"setaccount",
		"setban",
		"setmocktime",
		"setnetworkactive",
		"signmessage",
		"signmessagewithprivatekey",
		"signrawtransaction",
		"signrawtransactionwithkey",
		"stop",
		"submitblock",
		"syncwithvalidationinterfacequeue",
		"verifychain",
		"waitforblock",
		"waitforblockheight",
		"waitfornewblock",
		"walletlock",
		"walletpassphrase",
		"walletpassphrasechange",
	],


	redisUrl:process.env.BTCEXP_REDIS_URL,

	site: {
		hideInfoNotes: process.env.BTCEXP_UI_HIDE_INFO_NOTES,
		homepage:{
			recentBlocksCount: parseInt(process.env.BTCEXP_UI_HOME_PAGE_LATEST_BLOCKS_COUNT || (slowDeviceMode ? 5 : 10))
		},
		blockTxPageSize: (slowDeviceMode ? 10 : 20),
		addressTxPageSize: 10,
		txMaxInput: (slowDeviceMode ? 3 : 15),
		browseBlocksPageSize: parseInt(process.env.BTCEXP_UI_BLOCKS_PAGE_BLOCK_COUNT || (slowDeviceMode ? 10 : 25)),
		browseMempoolTransactionsPageSize: (slowDeviceMode ? 10 : 25),
		addressPage:{
			txOutputMaxDefaultDisplay:10
		},
		valueDisplayMaxLargeDigits: 4,
	/*
		prioritizedToolIdsList: [0, 10, 11, 9, 3, 4, 16, 12, 2, 5, 15, 1, 6, 7, 13, 8],
		toolSections: [
			{name: "Basics", items: [0, 2]},
			{name: "Mempool", items: [4, 16, 5]},
			{name: "Analysis", items: [9, 18, 10, 11, 12, 3, 20]},
			{name: "Technical", items: [15, 6, 7, 1]},
			{name: "Fun", items: [8, 17, 19, 13]},
		]
	*/
		prioritizedToolIdsList: [0, 4, 5, 3, 6, 2, 5, 4],
		toolSections: [
			{name: "Basics", items: [0, 2]},
			{name: "Mempool", items: []},
			{name: "Analysis", items: [ 8, 4, 5, 3, 6, 9]},
			{name: "Technical", items: [7]}
		]
	},




credentials: credentials,

	siteTools:[
	/* 0 */		{name:"Node Details", url:"./node-details", desc:"Node basics (version, uptime, etc)", iconClass:"bi-info-circle"},
	/* 1 */		{name:"Peers", url:"./peers", desc:"Details about the peers connected to this node.", iconClass:"bi-diagram-3"},
	/* 2 */		{name:"Browse Blocks", url:"./blocks", desc:"Browse all blocks in the blockchain.", iconClass:"bi-boxes"},
	/* 3 */		{name:"Transaction Stats", url:"./tx-stats", desc:"See graphs of total transaction volume and transaction rates.", iconClass:"bi-graph-up"},
	/* 4 */		{name:"Block Stats", url:"./block-stats", desc:"Summary data for blocks in configurable range.", iconClass:"bi-stack"},
	/* 5 */		{name:"Block Analysis", url:"./block-analysis", desc:"Summary analysis for all transactions in a block.", iconClass:"bi-chevron-double-down"},
	/* 6 */	    {name:"Difficulty History", url:"./difficulty-history", desc:"Details of difficulty changes over time.", iconClass:"bi-clock-history"},
	/* 7 */ 	{name:"API", url:`.${apiDocs.baseUrl}/docs`, desc:"View docs for the public API.", iconClass:"bi-braces-asterisk"},
	/* 8 */		{name:"UTXO Set", url:"./utxo-set", desc:"View the latest UTXO Set.", iconClass:"bi-list-columns"},
	/* 9 */		{name:"Next Halving", url:"./next-halving", desc:"Estimated details about the next halving.", iconClass:"bi-square-half"},
]
};


debugLog(`Config(final): privacyMode=${module.exports.privacyMode}`);
debugLog(`Config(final): slowDeviceMode=${module.exports.slowDeviceMode}`);
debugLog(`Config(final): demo=${module.exports.demoSite}`);
debugLog(`Config(final): rpcAllowAll=${module.exports.rpcBlacklist.length == 0}`);
