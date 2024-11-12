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

3. Create a `.env` File. In the root directory, create a `.env` file and add your `NTT Manager Program ID`:

```bash
NTT_MANAGER_PROGRAM_ID="INSERT_MANAGER_PROGRAM_ID"
```

4. Configure Your Wallet Keypair:

   - Ensure that you have a funded wallet on the Solana Devnet. The keypair should be stored in the `src/config/keys.json` file
   - Update the wallet path in each script to point to this JSON file

## Files Overview

### 1. `createSquad.ts`
This script creates a new Squads multisig instance on Solana's Devnet.
Sets up member permissions and threshold requirements.

Run the script using the following command:

```bash
npm run create-squad
```

> **Note:** The script generates a `multisig-keys.json` file containing the public keys of the Squads multisig instance

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

Run the script using the following command:

```bash
npm run transfer-ownership-mainnet
```

### 4. `managageLimits.ts`
Manages NTT program parameters through Squads multisig.

**Key Features:**
- Sets inbound and outbound rate limits for token transfers
- Implements pause/unpause functionality
- Creates and executes Squads proposals for parameter changes

Run the script using the following command:

```bash
npm run manage-limits
```

## Configuration Requirements

Each script requires:
- A wallet keypair JSON file
- Specific program IDs and addresses
- Connection to Solana Devnet

## Important Notes

1. Update the following TODOs in each script:
   - Wallet paths
   - NTT Manager Program ID: defined in the `.env` file as `NTT_MANAGER_PROGRAM_ID`
   - Squads public keys: generated in the Create Squad step and saved in `multisig-keys.json`

2. Transaction signing:
   - Multiple squad members may need to sign based on the threshold
   - Proper permissions must be set for transaction execution

3. Script Customization:
   - Adjust rate limits and other parameters in manage-limits as per your application requirements
