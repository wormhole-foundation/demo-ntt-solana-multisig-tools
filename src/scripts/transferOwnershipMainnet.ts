import * as anchor from '@project-serum/anchor';
import {
	Connection as solanaConnection,
	PublicKey,
	TransactionMessage,
	VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import idl from '../config/idl.json';
const fs = require('fs');

// Single token configuration preset
const tokenConfig = {
	// TODO: change to your NTT manager address
	ntt_manager: "nttCaQKV7n2kQVAkX8LMD4VX2Fb5D6CoxNMaMPj7Fok", 
	// TODO: change to your multisig address
	squads_address: "45S975zzDtnmx6q1NatWLPYLd1ptubUCigdRQR7Cn31W", 
	// TODO: change to your Squads vault, which is not the same as the multisig address!!
	vault_pda: "3Zc77zF9zghpjU97CVoZQ8QswC8bwpcX55KFQdJcRkCc", 
	send_txn: true, // Set to false for dry run
} as const;

(async () => {
	// TODO: needs to be token owner & creator of the Squads multisig
	const tokenOwnerWalletPath = 'src/config/keys.json';
	const walletJSON = JSON.parse(fs.readFileSync(tokenOwnerWalletPath, 'utf-8'));
	const walletKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));

	const nttManagerProgramId = tokenConfig.ntt_manager;
	const nttManagerProgramIdKey = new PublicKey(nttManagerProgramId);

	console.log("Token config:", tokenConfig);

	// TODO: change this to mainnet-beta for mainnet deployments or ideally to a private staked RPC connection
	const solanaCon = new solanaConnection('https://api.devnet.solana.com');

	const [configPublicKey, _configPublicKeyBump] = PublicKey.findProgramAddressSync(
		[Buffer.from('config')],
		nttManagerProgramIdKey
	);

	// can be retrieved in the setting of the Squads UI
	const multisigAddress = new PublicKey(tokenConfig.squads_address);
	
	// Get deserialized multisig account info
	const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
		solanaCon,
		multisigAddress
	);

	// Derive the PDA of the Squads Vault
	// this is going to be the Upgrade authority address, which is controlled by the Squad!
	const [vaultPda] = multisig.getVaultPda({
		multisigPda: multisigAddress,
		index: 0,
	});
	console.log(`Derived vault PDA: ${vaultPda}`);

	// Validate that calculated vault PDA matches the preset
	if (vaultPda.toString() !== tokenConfig.vault_pda) {
		console.log('Calculated vault PDA does not match preset. Please check configuration.');
		console.log(`Calculated vault PDA: ${vaultPda}`);
		console.log(`Expected vault PDA: ${tokenConfig.vault_pda}`);
		return;
	}

	// temporary pda, needed before claim instruction
	const [upgradeLockPublicKey, _upgradeLockPublicKey] = PublicKey.findProgramAddressSync(
		[Buffer.from('upgrade_lock')],
		nttManagerProgramIdKey
	);
	
	//   The programDataPublicKey is the PDA that stores the program's data
	const bpfLoaderUpgradeableProgramPublicKey = new PublicKey(
		'BPFLoaderUpgradeab1e11111111111111111111111'
	);
	const [programDataPublicKey, _programDataBump] = PublicKey.findProgramAddressSync(
		[nttManagerProgramIdKey.toBuffer()],
		bpfLoaderUpgradeableProgramPublicKey
	);

	// TODO: change this to mainnet-beta for mainnet deployments
	const anchorConnection = new anchor.web3.Connection(
		anchor.web3.clusterApiUrl('devnet'),
		'confirmed'
	);
	const wallet = new anchor.Wallet(walletKeypair);
	const provider = new anchor.AnchorProvider(anchorConnection, wallet, {
		preflightCommitment: 'confirmed',
	});
	anchor.setProvider(provider);

	const program = new anchor.Program(idl as anchor.Idl, nttManagerProgramId, provider);

	console.log(`Upgrade lock: ${upgradeLockPublicKey.toString()}`);

	if (!tokenConfig.send_txn) {
		console.log("send_txn is false, so we are doing a dry run");
		return;
	}

	console.log("Transferring ownership to temporary account...");
	await program.methods
		.transferOwnership()
		.accounts({
			config: configPublicKey,
			owner: wallet.publicKey,
			newOwner: vaultPda,
			upgradeLock: upgradeLockPublicKey,
			programData: programDataPublicKey,
			bpfLoaderUpgradeableProgram: bpfLoaderUpgradeableProgramPublicKey,
		})
		.signers([wallet.payer])
		.rpc();
	console.log("Ownership transfer to temporary account completed.");

	// this needs to be someone who has permissions to sign transactions for the squad!
	const squadMember = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));

	// Get the updated transaction index
	const currentTransactionIndex = Number(multisigInfo.transactionIndex);
	const newTransactionIndex = BigInt(currentTransactionIndex + 1);

	// this transaction gets wrapped and send to the vault of the squads to be signed there
	const instructionClaim = await program.methods
		.claimOwnership()
		.accounts({
			config: configPublicKey,
			upgradeLock: upgradeLockPublicKey,
			newOwner: vaultPda,
			programData: programDataPublicKey,
			bpfLoaderUpgradeableProgram: bpfLoaderUpgradeableProgramPublicKey,
		})
		.instruction();

	// Build a message with instructions we want to execute
	const testClaimMessage = new TransactionMessage({
		payerKey: vaultPda,
		recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		instructions: [instructionClaim],
	});

	const uploadTransactionIx = await multisig.instructions.vaultTransactionCreate({
		multisigPda: multisigAddress,
		// every squad has a global counter for transactions
		transactionIndex: newTransactionIndex,
		creator: squadMember.publicKey,
		vaultIndex: 0,
		ephemeralSigners: 0,
		transactionMessage: testClaimMessage,
	});

	// proposal is squad specific!
	const createProposalIx = multisig.instructions.proposalCreate({
		multisigPda: multisigAddress,
		transactionIndex: newTransactionIndex,
		creator: squadMember.publicKey,
	});

	const txMessage = new TransactionMessage({
		payerKey: squadMember.publicKey,
		recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		instructions: [uploadTransactionIx, createProposalIx],
	}).compileToV0Message();

	const transactionFinal = new VersionedTransaction(txMessage);
	// needs to be signed by as many squads members to reach threshold,
	// for that we also execute the proposalApprove method
	transactionFinal.sign([squadMember]);

	console.log("Sending the final transaction...");
	const signatureFinal = await solanaCon.sendTransaction(transactionFinal);
	console.log(`Transaction signature: ${signatureFinal}`);

	// awaiting transaction to be confirmed
	await solanaCon.confirmTransaction({
		signature: signatureFinal,
		blockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		lastValidBlockHeight: (await solanaCon.getLatestBlockhash()).lastValidBlockHeight,
	});

	console.log('Claim the ownership by confirming the transaction in the Squads UI!');
})();
