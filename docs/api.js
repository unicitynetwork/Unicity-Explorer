module.exports = {
	"version": "2.0.0",
	"baseUrl": "/api",

	"routes":[
		// blocks
		{
			"category":"blocks",
			"url":"/block/$HASH",
			"desc":"Returns the details of the block with the given hash.",
			"testUrl":"/block/494afaa8539a144da066b9c2e09dfa78dc716e7a9a14f229d1eaa09c7d391fc3"
		},

		{
			"category":"blocks",
			"url":"/block/$HEIGHT",
			"desc":"Returns the details of the block at the given height.",
			"testUrl":"/block/12345"
		},
		
		{
			"category":"blocks",
			"url":"/block/header/$HASH",
			"desc":"Returns the details of the block header with the given hash.",
			"testUrl":"/block/header/494afaa8539a144da066b9c2e09dfa78dc716e7a9a14f229d1eaa09c7d391fc3"
		},

		{
			"category":"blocks",
			"url":"/block/header/$HEIGHT",
			"desc":"Returns the details of the block header at the given height.",
			"testUrl":"/block/header/12345"
		},

		{
			"category":"blocks",
			"url":"/blocks/tip",
			"desc":"Returns basic details about the chain tip."
		},




		// transactions
		{
			"category":"transactions",
			"url":"/tx/$TXID",
			"desc":"Returns the details of the transaction with the given txid."
		},
		{
			"category":"transactions",
			"url":"/tx/volume/24h",
			"desc":"Returns total output of all transactions over the last 24hrs.",
			"testUrl": "/tx/volume/24h",
			"hideInSlowMode": true
		},		
		



		// blockchain
		{
			"category":"blockchain",
			"url":"/blockchain/coins",
			"desc":"Returns the current supply of Alpha. An estimate using a checkpoint can be returned in 2 cases: on 'slow' devices, and before the UTXO Set snapshot is loaded."
		},
		{
			"category":"blockchain",
			"url":"/blockchain/utxo-set",
			"desc":"Returns the latest UTXO Set snapshot. Warning: This call can be very slow, depending on node hardware and index configurations."
		},
		{
			"category":"blockchain",
			"url":"/blockchain/next-halving",
			"desc":"Returns details about the next, upcoming halving."
		},



		// admin
		{
			"category":"admin",
			"url":"/version",
			"desc":"Returns the semantic version of the public API, which is maintained separate from the app version."
		},

	]
}