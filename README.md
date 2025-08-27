# NTT Solana Multisig Tools

This repository contains scripts for managing a Solana Native Token Transfer (NTT) program using the Squads multisig functionality.

By using these scripts, developers can:

- Transfer ownership of the NTT program to a multisig account, ensuring that changes require approval from multiple parties
- Set and manage rate limits for token transfers, helping to prevent overspending or unauthorized transfers
- Pause and unpause the NTT program to control token flow as needed

## Project Structure

The project is organized as follows:

```plaintext
demo-ntt-solana-multisig-tools/
├── src/
│   ├── config/
│   │   ├── idl.json                    # Interface description for the NTT program
│   │   ├── keys.json                   # JSON file where the user inputs the wallet keypair array
│   ├── scripts/
│   │   ├── createSquad.ts              # Script to create a new Squads multisig instance
│   │   ├── manageLimits.ts             # Script to manage NTT parameters (rate limits, pause)
│   │   ├── transferOwnership.ts        # Transfers ownership to Squads vault on Devnet
│   │   ├── transferOwnershipMainnet.ts # Transfers ownership on Mainnet with Squads UI support
├── .env                                # Environment file for storing the NTT manager program ID
├── .gitignore                          # Specifies files/folders to ignore in version control
├── package.json                        # Project dependencies and scripts
├── tsconfig.json                       # TypeScript configuration
├── README.md                           # Project overview and setup instructions
```

## Prerequisites

Ensure the following dependencies are installed and configured:

- Node.js with TypeScript 
- Solana web3.js
- Anchor framework
- Squads SDK (@sqds/multisig)
- Wormhole NTT SDK
- Solana CLI

## Project Setup

1. Clone the Repository:

```bash
git clone https://github.com/wormhole-foundation/demo-ntt-solana-multisig-tools.git
cd demo-ntt-solana-multisig-tools
```

2. Install Dependencies:

```bash
npm install
```

3. Configure Script Presets:

   - **`transferOwnership.ts`** and **`transferOwnershipMainnet.ts`**: Update the `tokenConfig` object with:
     - `ntt_manager`: Your NTT Manager Program ID
     - `squads_address`: Your Squads multisig address  
     - `vault_pda`: Your Squads vault PDA (only for mainnet script)
     - `send_txn`: Set to `false` for dry runs, `true` to execute transactions
   - **`createSquad.ts`**: Update `walletPath`, `members` or `threshold`
   - **`manageLimits.ts`**: Update `walletPath`, NTT manager program ID, rate limits, chain selection or pause status

4. Configure Your Wallet Keypair:

   - Ensure that you have a funded wallet on the Solana Devnet. The keypair should be stored in the `src/config/keys.json` file
   - Update the wallet path in each script to point to this JSON file

## Files Overview

### 1. `createSquad.ts`
This script creates a new Squads multisig instance on Solana's Devnet.
Sets up member permissions and threshold requirements.

**Configurable Values:**
- **`walletPath`**: Path to your wallet keypair JSON file
- **`members`**: List of multisig members with their permissions 
- **`threshold`**: Number of votes required to approve transactions 

Run the script using the following command:

```bash
npm run create-squad
```

> **Note:** The script generates a `multisig-info.json` file containing the public keys of the Squads multisig instance

### 2. `transferOwnership.ts`
Handles the transfer of NTT program ownership to a Squads vault on Devnet.

**Key Features:**
- Transfers ownership to a temporary account
- Creates and executes a transaction proposal through Squads
- Claims ownership using the Squads vault

Run the script using the following command:

```bash
npm run transfer-ownership
```

### 3. `transferOwnershipMainnet.ts`
Handles the transfer of NTT program ownership to a Squads vault on mainnet in addition to the Squads UI.  
⚠️ **Warning:** Your entered multisig address address is not the same as the vault address!

**Note:** This script only moves ownership to a temporary account. The actual ownership transfer to the Squads vault must be completed manually through the Squads UI by approving and executing the created proposal.

Run the script using the following command:

```bash
npm run transfer-ownership-mainnet
```

### 4. `manageLimits.ts`
Manages NTT program parameters through Squads multisig.

**Key Features:**
- Sets inbound and outbound rate limits for token transfers
- Implements pause/unpause functionality
- Creates and executes Squads proposals for parameter changes

**Configurable Values:**
- **`walletPath`**: Path to your wallet keypair JSON file
- **`nttManagerProgramId`**: Your NTT Manager Program ID 
- **`outbountLimit`**: Outbound transfer rate limit in token units 
- **`inboundLimit`**: Inbound transfer rate limit in token units 
- **`chain`**: Target chain for inbound limits (currently 'Sepolia')
- **`paused`**: Whether the contract is paused 
- **`instructions`**: Which instruction to execute (currently outboundLimitInstruction)

Run the script using the following command:

```bash
npm run manage-limits
```

## Configuration Requirements

Each script requires:
- A wallet keypair JSON file
- **`transferOwnership.ts`** and **`transferOwnershipMainnet.ts`**: Updated `tokenConfig` preset
- **`createSquad.ts`**: Wallet path, member list, threshold, and timeLock settings
- **`manageLimits.ts`**: Wallet path, rate limit values, chain selection or pause configuration
- Connection to appropriate Solana network (Devnet/Mainnet)

## Important Notes

1. Update the following TODOs in each script:
   - **Wallet paths**: Update in all scripts to point to your keypair file
   - **`tokenConfig` preset values**: For `transferOwnership.ts` and `transferOwnershipMainnet.ts`
   - **Multisig configuration**: For `createSquad.ts` (members, threshold)
   - **Rate limits and parameters**: For `manageLimits.ts` (limits, chain, pause status)

2. Transaction signing:
   - Multiple squad members may need to sign based on the threshold
   - Proper permissions must be set for transaction execution

3. Script Customization:
   - Adjust rate limits and other parameters in manage-limits as per your application requirements
