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
import 'dotenv/config';

(async () => {
	// TODO: needs to be token owner & creator of the Squads multisig
	const tokenOwnerWalletPath = 'src/config/keys.json';
	const walletJSON = JSON.parse(fs.readFileSync(tokenOwnerWalletPath, 'utf-8'));
	const walletKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));

	// TODO: change to your NTT manager address from the .env file
	const nttManagerProgramId = process.env.NTT_MANAGER_PROGRAM_ID as string;
	const nttManagerProgramIdKey = new PublicKey(nttManagerProgramId);

	// TODO: change this to mainnet-beta for mainnet deployments or ideally to a private staked RPC connection
	const solanaCon = new solanaConnection('https://api.devnet.solana.com');

	const [configPublicKey, _configPublicKeyBump] = await PublicKey.findProgramAddress(
		[Buffer.from('config')],
		nttManagerProgramIdKey
	);

	// TODO: change to your multisig address, which is not the same as the vault address!!
	// can be retrieved in the setting of the Squads UI
	const multisigAddress = new PublicKey('CnTS7RmoqVh88grwarBdkXM63avL4yaz8mtjzxjAj9zn');
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
	console.log(vaultPda);
	// temporary pda, needed before claim instruction
	const [upgradeLockPublicKey, _upgradeLockPublicKey] = await PublicKey.findProgramAddress(
		[Buffer.from('upgrade_lock')],
		nttManagerProgramIdKey
	);
	//   The programDataPublicKey is the PDA that stores the program's data
	const bpfLoaderUpgradeableProgramPublicKey = new PublicKey(
		'BPFLoaderUpgradeab1e11111111111111111111111'
	);
	const [programDataPublicKey, _programDataBump] = await PublicKey.findProgramAddress(
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
	// delegate ownership to a temporary account!
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
	const signatureFinal = await solanaCon.sendTransaction(transactionFinal);
	await solanaCon.confirmTransaction(signatureFinal);

	console.log('Ownership transfer completed successfully.');
})();
