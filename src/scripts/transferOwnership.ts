import * as anchor from '@project-serum/anchor';
import {
	Connection as solanaConnection,
	PublicKey,
	TransactionMessage,
	VersionedTransaction,
} from '@solana/web3.js';
import idl from '../config/idl.json';
import * as multisig from '@sqds/multisig';
const fs = require('fs');

// TODO: update RPC endpoint configuration
const RPC_ENDPOINT = anchor.web3.clusterApiUrl('devnet');

// Single token configuration preset for devnet
const tokenConfig = {
	ntt_manager: "nttCaQKV7n2kQVAkX8LMD4VX2Fb5D6CoxNMaMPj7Fok", // TODO: change to your NTT manager address
	send_txn: false, // Set to false for dry run
} as const;

(async () => {
	// TODO: needs to be token owner & creator of the Squads multisig
	const tokenOwnerWalletPath = 'src/config/keys.json';
	const walletJSON = JSON.parse(fs.readFileSync(tokenOwnerWalletPath, 'utf-8'));
	const walletKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));

	const nttManagerProgramId = tokenConfig.ntt_manager;
	const nttManagerProgramIdKey = new PublicKey(nttManagerProgramId);

	console.log("Token config:", tokenConfig);
	console.log(`Using public key: ${walletKeypair.publicKey}`);

	const solanaCon = new solanaConnection(RPC_ENDPOINT);

	const [configPublicKey, _configPublicKeyBump] = PublicKey.findProgramAddressSync(
		[Buffer.from('config')],
		nttManagerProgramIdKey
	);

	// claiming ownership from temporary account with squads sdk!
	// Getting the squads pubkey from the multisig-keys.json file (created in the createSquad script):
	const multisigKeysPath = 'src/config/multisig-info.json';
	const { multisigPubkey } = JSON.parse(fs.readFileSync(multisigKeysPath, 'utf-8'));
	const multisigAddress = new PublicKey(multisigPubkey);
	console.log("MultisigAddress:", multisigAddress.toBase58());

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

	const anchorConnection = new anchor.web3.Connection(
		RPC_ENDPOINT,
		'confirmed'
	);
	const wallet = new anchor.Wallet(walletKeypair);
	const provider = new anchor.AnchorProvider(anchorConnection, wallet, {
		preflightCommitment: 'confirmed',
	});
	anchor.setProvider(provider);

	const program = new anchor.Program(idl as anchor.Idl, nttManagerProgramId, provider);

	if (!tokenConfig.send_txn) {
		console.log("send_txn is false, so we are doing a dry run");
		return;
	}

	// delegate ownership to a temporary account!
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
	console.log("Ownership transfer to a temporary account completed.");

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

	/*
      ONLY DEVNET VERSION
      transferOwnershipMainnet.ts can be used with Squads UI for Mainnet!!
    */

	// proposalApprove method needs to be executed for every member of the squad!
	// only needed for testing purposes, if on devnet.
	// Squads UI is only available on mainnet, which can be used instead!
	const createApproveIx = multisig.instructions.proposalApprove({
		multisigPda: multisigAddress,
		transactionIndex: newTransactionIndex,
		member: squadMember.publicKey,
	});

	const finalTxMessage = new TransactionMessage({
		payerKey: squadMember.publicKey,
		recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		instructions: [uploadTransactionIx, createProposalIx, createApproveIx],
	}).compileToV0Message();

	const transaction = new VersionedTransaction(finalTxMessage);
	// needs to be signed by as many squads members to reach threshold,
	// for that we also execute the proposalApprove method
	transaction.sign([squadMember]);
	
	console.log("Sending proposal transaction...");
	const signature = await solanaCon.sendTransaction(transaction);
	console.log(`Proposal transaction signature: ${signature}`);
	await solanaCon.confirmTransaction({
		signature: signature,
		blockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		lastValidBlockHeight: (await solanaCon.getLatestBlockhash()).lastValidBlockHeight,
	}, 'finalized');

	const executeClaimIx = await multisig.instructions.vaultTransactionExecute({
		connection: solanaCon,
		multisigPda: multisigAddress,
		transactionIndex: newTransactionIndex,
		member: squadMember.publicKey,
	});

	const executeFinalTx = new TransactionMessage({
		payerKey: squadMember.publicKey,
		recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		instructions: [executeClaimIx.instruction],
	}).compileToV0Message(executeClaimIx.lookupTableAccounts);

	const transactionFinal = new VersionedTransaction(executeFinalTx);
	// needs to be signed by as many squads members to reach threshold,
	// for that we also execute the proposalApprove method
	transactionFinal.sign([squadMember]);
	
	console.log("Executing claim transaction...");
	const signatureFinal = await solanaCon.sendTransaction(transactionFinal);
	console.log(`Execution transaction signature: ${signatureFinal}`);
	await solanaCon.confirmTransaction({
		signature: signatureFinal,
		blockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		lastValidBlockHeight: (await solanaCon.getLatestBlockhash()).lastValidBlockHeight,
	});

	console.log('Ownership transfer to the Squads Vault on devnet completed successfully.');
})();
