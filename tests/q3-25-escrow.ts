import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Q325Escrow } from "../target/types/q3_25_escrow";
import * as spl from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

describe("q3-25-escrow", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();

  const connection = provider.connection;

  const program = anchor.workspace.q325Escrow as Program<Q325Escrow>;
  const programId = program.programId;
  const tokenProgram = spl.TOKEN_2022_PROGRAM_ID;

  const SEED = new anchor.BN(1);

  const confirm = async (signature: string) => {
    const block = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      ...block,
    });

    return signature;
  };

  const log = (signature: string) => {
    console.log(
      `Your transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=custom&customUrl=${connection.rpcEndpoint}`
    );
    return signature;
  };

  const [maker, taker, mintA, mintB] = Array.from(
    {
      length: 4,
    },
    () => Keypair.generate()
  );

  const [makerAtaA, makerAtaB, takerAtaA, takerAtaB] = [maker, taker]
    .map((a) => {
      return [mintA, mintB].map((m) => {
        return spl.getAssociatedTokenAddressSync(
          m.publicKey,
          a.publicKey,
          true,
          tokenProgram
        );
      });
    })
    .flat();

  const [escrowPda, _] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      maker.publicKey.toBytes(),
      SEED.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );

  const vault = spl.getAssociatedTokenAddressSync(
    mintA.publicKey,
    escrowPda,
    true,
    programId
  );

  const accounts = {
    maker: maker.publicKey,
    taker: taker.publicKey,
    mintA: mintA.publicKey,
    mintB: mintB.publicKey,
    makerAtaA,
    makerAtaB,
    takerAtaA,
    takerAtaB,
    escrow: escrowPda,
    vault,
    tokenProgram,
    systemProgram: SystemProgram.programId,
    associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
  };

  it("Airdrop and create mint!", async () => {
    const mintLamports = await spl.getMinimumBalanceForRentExemptMint(
      connection
    );
    const tx = new anchor.web3.Transaction();

    tx.instructions = [
      ...[maker, taker].map((a) => {
        return SystemProgram.transfer({
          fromPubkey: provider.publicKey,
          toPubkey: a.publicKey,
          lamports: 1 * LAMPORTS_PER_SOL,
        });
      }),

      ...[mintA, mintB].map((m) => {
        return SystemProgram.createAccount({
          fromPubkey: provider.publicKey,
          newAccountPubkey: m.publicKey,
          lamports: mintLamports,
          space: spl.MINT_SIZE,
          programId: tokenProgram,
        });
      }),

      ...[
        { mint: mintA.publicKey, authority: maker.publicKey, ata: makerAtaA },
        { mint: mintB.publicKey, authority: taker.publicKey, ata: takerAtaB },
      ].flatMap((x) => {
        return [
          spl.createInitializeMint2Instruction(
            x.mint,
            6,
            x.authority,
            null,
            tokenProgram
          ),
          spl.createAssociatedTokenAccountIdempotentInstruction(
            provider.publicKey,
            x.ata,
            x.authority,
            x.mint,
            tokenProgram
          ),
          spl.createMintToInstruction(
            x.mint,
            x.ata,
            x.authority,
            1e9,
            undefined,
            tokenProgram
          ),
        ];
      }),
    ];

    await provider.sendAndConfirm(tx, [maker, taker, mintA, mintB]).then(log);
  });

  it("Make", async () => {
    await program.methods
      .make(SEED, new anchor.BN(1e9), new anchor.BN(1e9))
      .accounts({
        maker: maker.publicKey,
        mintA: mintA.publicKey,
        mintB: mintB.publicKey,
        tokenProgram,
      })
      .signers([maker])
      .rpc()
      .then(confirm)
      .then(log);
  });

  it("Refund", async () => {
    await program.methods
      .refund()
      .accounts({
        maker: maker.publicKey,
        mintA,
        makerAtaA,
        escrow: escrowPda,
        vault,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        tokenProgram,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([maker])
      .rpc()
      .then(confirm)
      .then(log);
  });

  it("Take", async () => {
    await program.methods
      .take()
      .accounts({ ...accounts } as any)
      .signers([taker])
      .rpc()
      .then(confirm)
      .then(log);
  });
});
