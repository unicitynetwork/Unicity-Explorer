"use strict";

const Decimal = require("decimal.js");
const Decimal8 = Decimal.clone({ precision:8, rounding:8 });



const blockRewardEras = [ new Decimal8(10) ];
for (let i = 1; i < 34; i++) {
	let previous = blockRewardEras[i - 1];
	blockRewardEras.push(new Decimal8(previous).dividedBy(2));
}

const currencyUnits = [
	{
		type:"native",
		name:"ALPHA",
		multiplier:1,
		default:true,
		values:["", "alpha", "ALPHA"],
		decimalPlaces:8
	},
	{
		type:"native",
		name:"mALPHA",
		multiplier:1000,
		values:["malpha"],
		decimalPlaces:5
	},
	{
		type:"native",
		name:"bits",
		multiplier:1000000,
		values:["bits"],
		decimalPlaces:2
	},
	{
		type:"native",
		name:"sat",
		multiplier:100000000,
		values:["sat", "satoshi"],
		decimalPlaces:0
	},
	{
		type:"exchanged",
		name:"USD",
		multiplier:"usd",
		values:["usd"],
		decimalPlaces:2,
		symbol:"$"
	},
	{
		type:"exchanged",
		name:"EUR",
		multiplier:"eur",
		values:["eur"],
		decimalPlaces:2,
		symbol:"€"
	},
];

module.exports = {
	name:"Alpha",
	ticker:"ALPHA",
	logoUrlsByNetwork:{
		"main":"./img/network-mainnet/logo.svg",
	},
	coinIconUrlsByNetwork:{
		"main":"./img/network-mainnet/coin-icon.svg",
	},
	coinColorsByNetwork: {
		"main": "#F7931A",
	},
	siteTitlesByNetwork: {
		"main":"Alpha Explorer",
	},
	demoSiteUrlsByNetwork: {
		"main": "https://bitcoinexplorer.org",
		"test": "https://testnet.bitcoinexplorer.org",
		"signet": "https://signet.bitcoinexplorer.org",
	},
	knownTransactionsByNetwork: {
		main: "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16",
	},

	maxBlockWeight: 4000000,
	maxBlockSize: 1000000,
	minTxBytes: 166,
	minTxWeight: 166 * 4,
	

// RandomX implies that difficulty ajdustment is every block (not every 2016 blocks)
// Use 1000 to get a reasonable difficulty adjustment period
	difficultyAdjustmentBlockCount: 1000,
	maxSupplyByNetwork: {
		"main": new Decimal(21000000), // ref: https://bitcoin.stackexchange.com/a/38998
	},

	targetBlockTimeSeconds: 120,
	targetBlockTimeMinutes: 2,
	currencyUnits:currencyUnits,
	currencyUnitsByName:{"ALPHA":currencyUnits[0], "mALPHA":currencyUnits[1], "bits":currencyUnits[2], "sat":currencyUnits[3]},
	baseCurrencyUnit:currencyUnits[3],
	defaultCurrencyUnit:currencyUnits[0],
	feeSatoshiPerByteBucketMaxima: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 75, 100, 150],
	

	halvingBlockIntervalsByNetwork: {
		"main": 210000*5,
	},

	terminalHalvingCountByNetwork: {
		"main": 32,
	},


	
	genesisBlockHashesByNetwork:{
		"main":	"0000000cd159482c9663a50e6a23a63155f9477384843473b784449b897569bf",
	},
	genesisCoinbaseTransactionIdsByNetwork: {
		"main":	"c61f9003735f01c77c4a8b3554b86b8bda7ce1f3854f1e657abfad6f49462614",
	},
	genesisCoinbaseTransactionsByNetwork:{
		"main": {
			"hex": "01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4304ffff001d01043b46696e616e6369616c2054696d65732032352f4d61792f3230323420576861742077656e742077726f6e672077697468206361706974616c69736dffffffff0100ca9a3b00000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000",
			"txid": "c61f9003735f01c77c4a8b3554b86b8bda7ce1f3854f1e657abfad6f49462614",
			"hash": "c61f9003735f01c77c4a8b3554b86b8bda7ce1f3854f1e657abfad6f49462614",
			"size": 194,
			"vsize": 194,
			"version": 1,
			"confirmations":100000,
			"vin": [
				{
					"coinbase": "04ffff001d01043b46696e616e6369616c2054696d65732032352f4d61792f3230323420576861742077656e742077726f6e672077697468206361706974616c69736d",
					"sequence": 4294967295
				}
			],
			"vout": [
				{
					"value": 10,
					"n": 0,
					"scriptPubKey": {
						"asm": "04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f OP_CHECKSIG",
						"hex": "4104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac",
						"reqSigs": 1,
						"type": "pubkey",
						"addresses": [
							"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
						]
					}
				}
			],
			"blockhash": "0000000cd159482c9663a50e6a23a63155f9477384843473b784449b897569bf",
			"time": 1718524492,
			"blocktime": 1718524492
		},
	},
	genesisBlockStatsByNetwork:{
		"main": {
			"avgfee": 0,
			"avgfeerate": 0,
			"avgtxsize": 0,
			"blockhash": "0000000cd159482c9663a50e6a23a63155f9477384843473b784449b897569bf",
			"feerate_percentiles": [
				0,
				0,
				0,
				0,
				0
			],
			"height": 0,
			"ins": 0,
			"maxfee": 0,
			"maxfeerate": 0,
			"maxtxsize": 0,
			"medianfee": 0,
			"mediantime": 1718524492,
			"mediantxsize": 0,
			"minfee": 0,
			"minfeerate": 0,
			"mintxsize": 0,
			"outs": 1,
			"subsidy": 1000000000,
			"swtotal_size": 0,
			"swtotal_weight": 0,
			"swtxs": 0,
			"time": 1718524492,
			"total_out": 0,
			"total_size": 0,
			"total_weight": 0,
			"totalfee": 0,
			"txs": 1,
			"utxo_increase": 1,
			"utxo_size_inc": 117
		},
	},
	testData: {
		txDisplayTestList: {
			"634b57cf0673c50b98560dbdf48d0a8633303b5d9162175e08b304df159c259e" : {
				blockHeight: 694670, blockHash: "0000000000000000000ba61d43854a2460b219b5281db2c731ae03a4347eaf43"
			},
			"f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16" : {
				blockHeight: 170, blockHash: "00000000d1145790a8694403d4063f323d499e655c83426834d4ce2f8dd4a2ee"
			},
			"a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d" : {
				blockHeight: 57043, blockHash: "00000000152340ca42227603908689183edc47355204e7aca59383b0aaac1fd8"
			},
			"7b6e490670a5cfcc9b66d8aab142ac2e9b489ae7f40cadadfc69c19878ae81b0" : {
				blockHeight: 227835, blockHash: "00000000000001aa077d7aa84c532a4d69bdbff519609d1da0835261b7a74eb6"
			},
			"8f7f13d6b56ea9013f13d298bc0e9e9f4f9825f3e7fd96083a564b10b01025d9" : {
				blockHeight: 694521, blockHash: "00000000000000000009974b5f6011d7ec8af460dafcc668c7ede4324896b9ca"
			},
			"3215f4a32a26938ddf9eeb4de7f5f42e751410876500f6e93d943abb2c3cccc4" : {
				blockHeight: 694521, blockHash: "00000000000000000009974b5f6011d7ec8af460dafcc668c7ede4324896b9ca"
			},
			"333d5f27c6fc2d07ef8c19e17d33568706bc3d6875198aba6cff0a996698d46e" : {
				blockHeight: 694521, blockHash: "00000000000000000009974b5f6011d7ec8af460dafcc668c7ede4324896b9ca"
			},
			"a9ceb47b092f703c30b29cb8b864fb8fa895a5999b24aa56ae08a967b643087c" : {
				blockHeight: 694521, blockHash: "00000000000000000009974b5f6011d7ec8af460dafcc668c7ede4324896b9ca"
			},
			"bc968c93c6ff39f022f974504a22d548902fe5a8c4fb294f052f845e4c388fcb" : {
				blockHeight: 694521, blockHash: "00000000000000000009974b5f6011d7ec8af460dafcc668c7ede4324896b9ca"
			},
			"e4bd7949cbf067d17629a5f588bba051b4436d29b5978d674118539356745bd0" : {
				blockHeight: 227835, blockHash: "00000000000001aa077d7aa84c532a4d69bdbff519609d1da0835261b7a74eb6"
			},
			"54e48e5f5c656b26c3bca14a8c95aa583d07ebe84dde3b7dd4a78f4e4186e713" : {
				blockHeight: 230009, blockHash: "00000000000000ecbbff6bafb7efa2f7df05b227d5c73dca8f2635af32a2e949"
			},
			"d29c9c0e8e4d2a9790922af73f0b8d51f0bd4bb19940d9cf910ead8fbe85bc9b" : {
				blockHeight: 268060, blockHash: "000000000000000743aee48cf264e1aa4a05fc3018677be3c1bdbd2429ffeede"
			},
			"143a3d7e7599557f9d63e7f224f34d33e9251b2c23c38f95631b3a54de53f024" : {
				blockHeight: 306204, blockHash: "000000000000000038dea6f503ed3593b1495e135d9ed646c2ebb97a1ff35bd7"
			},
			"8f907925d2ebe48765103e6845c06f1f2bb77c6adc1cc002865865eb5cfd5c1c" : {
				blockHeight: 481824, blockHash: "0000000000000000001c8018d9cb3b742ef25114f27563e3fc4a1902167f9893"
			},
			"8f5834d39a634c1b4c6283b546e16e931cb34d28570c77860de1a86256c4344d" : {
				blockHeight: 629999, blockHash: "0000000000000000000d656be18bb095db1b23bd797266b0ac3ba720b1962b1e"
			},
			"7836d12e741ffc6e50dba9b461e117cfbe444e7daa73df648b3a441d5a9ee958" : {
				blockHeight: 230009, blockHash: "00000000000000ecbbff6bafb7efa2f7df05b227d5c73dca8f2635af32a2e949"
			},
			"29a3efd3ef04f9153d47a990bd7b048a4b2d213daaa5fb8ed670fb85f13bdbcf" : {
				blockHeight: 153509, blockHash: "00000000000000fb62bbadc0a9dcda556925b2d0c1ad8634253ac2e83ab8382f"
			},
			"fe28050b93faea61fa88c4c630f0e1f0a1c24d0082dd0e10d369e13212128f33" : {
				blockHeight: 1000, blockHash: "00000000c937983704a73af28acdec37b049d214adbda81d7e2a3dd146f6ed09"
			},
			"b10c007c60e14f9d087e0291d4d0c7869697c6681d979c6639dbd960792b4d41" : {
				blockHeight: 692261, blockHash: "0000000000000000000f14c35b2d841e986ab5441de8c585d5ffe55ea1e395ad"
			},
			"777c998695de4b7ecec54c058c73b2cab71184cf1655840935cd9388923dc288" : {
				blockHeight: 709632, blockHash: "0000000000000000000687bca986194dc2c1f949318629b44bb54ec0a94d8244"
			},
			"b53e3bc5edbb41b34a963ecf67eb045266cf841cab73a780940ce6845377f141" : {
				blockHeight: 608548, blockHash: "00000000000000000009cf4a72b39c634586e6e328365f0d7293964111148094"
			}
		}
	},
	genesisCoinbaseOutputAddressScripthash:"8b01df4e368ea28f8dc0423bcf7a4923e3a12d307c875e47a0cfbf90b5c39161",
	
	
	blockRewardFunction:function(blockHeight, chain) {
		let halvingBlockInterval = 210000*5;
		let index = Math.floor(blockHeight / halvingBlockInterval);

		return blockRewardEras[index];
	}
};
