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
     - `multisig_account`: Your Squads multisig account  
     - `squads_vault_pda`: Your Squads vault PDA (only for mainnet script)
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

**Configurable Variables:**
- **`RPC_ENDPOINT`**: RPC endpoint configuration that can be changed to a custom RPC endpoint if needed.
- **`tokenConfig.ntt_manager`**: Your NTT Manager Program ID on devnet
- **`tokenConfig.send_txn`**: Set to `false` for dry runs, `true` to execute transactions
- **`tokenOwnerWalletPath`**: Path to your wallet keypair JSON file

Run the script using the following command:

```bash
npm run transfer-ownership
```

### 3. `transferOwnershipMainnet.ts`
Handles the transfer of NTT program ownership to a Squads vault on mainnet in addition to the Squads UI.  
⚠️ **Warning:** Your entered multisig account address is not the same as the vault address!

**Configurable Variables:**
- **`RPC_ENDPOINT`**: RPC endpoint configuration for mainnet that ideally should use a custom RPC endpoint for Solana mainnet.
- **`tokenConfig.ntt_manager`**: Your NTT Manager Program ID on mainnet
- **`tokenConfig.multisig_account`**: Your Squads multisig account address
- **`tokenConfig.squads_vault_pda`**: Your Squads vault PDA (found in Squads UI Settings)
- **`tokenConfig.send_txn`**: Set to `false` for dry runs, `true` to execute transactions

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
- **`RPC_ENDPOINT`**: RPC endpoint configuration (defaults to devnet)

Run the script using the following command:

```bash
npm run manage-limits
```