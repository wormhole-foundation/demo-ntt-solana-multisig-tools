import * as multisig from '@sqds/multisig';
const { Permissions } = multisig.types;
import { Connection, Keypair } from '@solana/web3.js';
const fs = require('fs');

(async () => {
	const connection = new Connection('https://api.devnet.solana.com');

	// Random Public Key that will be used to derive a multisig PDA
	// This will need to be a signer on the transaction
	const createKey = Keypair.generate();
	// TODO: adjust to your own key that will pay for gas and be a signer of the created multisig
	const walletPath = 'src/config/keys.json';
	const walletJSON = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
	const creator = Keypair.fromSecretKey(Uint8Array.from(walletJSON));

	// Derive the multisig PDA
	const [multisigPda] = multisig.getMultisigPda({
		createKey: createKey.publicKey,
	});

	const [programConfigPda] = multisig.getProgramConfigPda({});
	const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
		connection,
		programConfigPda
	);
	const configTreasury = programConfig.treasury;

	const signature = await multisig.rpc.multisigCreateV2({
		connection: connection,
		creator: creator,
		// Must sign the transaction, unless the .rpc method is used.
		createKey: createKey,
		// The PDA of the multisig you are creating, derived by a random PublicKey
		multisigPda,
		// Here the config authority will be the system program
		configAuthority: null,
		// Create without any time-lock
		timeLock: 0,
		// List of the members to add to the multisig
		members: [
			{
				// Members Public Key
				key: creator.publicKey,
				// Granted Proposer, Voter, and Executor permissions
				permissions: Permissions.all(),
			},
		],
		// This means that there needs to be 2 votes for a transaction proposal to be approved
		threshold: 1,
		rentCollector: null,
		treasury: configTreasury,
	});

	console.log('New squad pubkey: ', multisigPda);
	console.log('Multisig created: ', signature);

	// Save the multisig pubkey and creation signature to multisig-keys.json
	const outputPath = 'src/config/multisig-keys.json';
	const multisigData = {
		multisigPubkey: multisigPda.toBase58(),
		creationSignature: signature,
	};

	fs.writeFileSync(outputPath, JSON.stringify(multisigData, null, 2));
	console.log(`Multisig keys saved to ${outputPath}`);
})();
