import * as anchor from '@project-serum/anchor';
import {
	Connection as solanaConnection,
	PublicKey,
	TransactionMessage,
	VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
const fs = require('fs');

import '@wormhole-foundation/sdk-solana-ntt';
import { getNttProgram, NTT } from '@wormhole-foundation/sdk-solana-ntt';

(async () => {
	// TODO: needs to be one of the signers of the Squad
	const walletPath = 'src/config/keys.json';
	const walletJSON = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
	const walletKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));

	//TODO: change to your NTT manager address
	const nttManagerProgramId = "nttCaQKV7n2kQVAkX8LMD4VX2Fb5D6CoxNMaMPj7Fok";
	const programIdKey = new PublicKey(nttManagerProgramId);

	const solanaCon = new solanaConnection('https://api.devnet.solana.com');

	const [configPublicKey, _] = PublicKey.findProgramAddressSync(
		[Buffer.from('config')],
		programIdKey
	);

	// Getting the squads pubkey from the multisig-keys.json file:
	const multisigKeysPath = 'src/config/multisig-info.json';
	const { multisigPubkey } = JSON.parse(fs.readFileSync(multisigKeysPath, 'utf-8'));
	const multisigAddress = new PublicKey(multisigPubkey);
	console.log("MultisigAddress:", multisigAddress.toBase58());

	const [vaultPda] = multisig.getVaultPda({
		multisigPda: multisigAddress,
		index: 0,
	});
	console.log(vaultPda);

	const anchorConnection = new anchor.web3.Connection(
		anchor.web3.clusterApiUrl('devnet'),
		'confirmed'
	);
	const wallet = new anchor.Wallet(walletKeypair);
	const provider = new anchor.AnchorProvider(anchorConnection, wallet, {
		preflightCommitment: 'confirmed',
	});
	anchor.setProvider(provider);

	// this needs to be someone who has permissions to sign transactions for the squad!
	const squadMember = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));

	// Get deserialized multisig account info
	const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
		solanaCon,
		multisigAddress
	);

	// Get the updated transaction index
	const currentTransactionIndex = Number(multisigInfo.transactionIndex);
	const newTransactionIndex = BigInt(currentTransactionIndex + 1);

	const program = getNttProgram(
		solanaCon,
		nttManagerProgramId,
		'2.0.0' // ntt solana version parameter
	);

	const [outboundLimitPublicKey] = PublicKey.findProgramAddressSync(
		[Buffer.from('outbox_rate_limit')],
		programIdKey
	);
	//TODO: change to your desired outbound limit
	// needs to have the correct amount of decimals for the respective chain
	const outbountLimit = new anchor.BN(2150000000); // 2.150000000 tokens on Solana
	const outboundLimitInstruction = await program.methods
		.setOutboundLimit({ limit: outbountLimit })
		.accounts({
			config: configPublicKey,
			owner: vaultPda,
			rateLimit: outboundLimitPublicKey,
		})
		.instruction();

	const [inboundrateLimitPublicKey] = PublicKey.findProgramAddressSync(
		[Buffer.from('inbox_rate_limit')],
		programIdKey
	);
	// List of ChainIds: https://github.com/wormhole-foundation/wormhole-sdk-ts/blob/fa4ba4bc349a7caada809f209090d79a3c5962fe/core/base/src/constants/chains.ts#L6
	//TODO: change to your desired inbound limit
	const inboundLimit = new anchor.BN(1150000000); // 1.15
	// will only work if the specific chain inbound limit was initialized (done with add-chain command)
	const inboundLimitInstruction = await NTT.createSetInboundLimitInstruction(program as any, {
		owner: vaultPda,
		chain: 'Sepolia',
		limit: new anchor.BN(inboundLimit.toString()),
	});

	const pauseInstruction = await NTT.createSetPausedInstruction(program as any, {
		owner: vaultPda,
		paused: false,
	});

	// Build a message with instructions we want to execute
	const testClaimMessage = new TransactionMessage({
		payerKey: vaultPda,
		recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		//TODO: modify this based on the instruction you want to perform (outboundLimitInstruction / inboundLimitInstruction or pauseInstruction)
		instructions: [outboundLimitInstruction],
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

	// proposalApprove method needs to be executed for every member of the squad!
	// only needed for testing purposes, if on devnet.
	// Squads UI is only available on mainnet, which can be used instead!
	const createApproveIx = multisig.instructions.proposalApprove({
		multisigPda: multisigAddress,
		transactionIndex: newTransactionIndex,
		member: squadMember.publicKey,
	});

	const txMessage = new TransactionMessage({
		payerKey: squadMember.publicKey,
		recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		instructions: [uploadTransactionIx, createProposalIx, createApproveIx],
	}).compileToV0Message();

	const transaction = new VersionedTransaction(txMessage);
	// needs to be signed by as many squads members to reach threshold,
	// for that we also execute the proposalApprove method
	transaction.sign([squadMember]);
	const signature = await solanaCon.sendTransaction(transaction);

	await solanaCon.confirmTransaction({
		signature: signature,
		blockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		lastValidBlockHeight: (await solanaCon.getLatestBlockhash()).lastValidBlockHeight,
	}, 'finalized');

	console.log(signature);
	console.log('Squad proposal created and approved.');

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
	const signatureFinal = await solanaCon.sendTransaction(transactionFinal);
	console.log(signatureFinal);
	await solanaCon.confirmTransaction({
		signature: signatureFinal,
		blockhash: (await solanaCon.getLatestBlockhash()).blockhash,
		lastValidBlockHeight: (await solanaCon.getLatestBlockhash()).lastValidBlockHeight,
	});

	console.log('Adjusting rate limits or paused the contract successfully.');
})();
