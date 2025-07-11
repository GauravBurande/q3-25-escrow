pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("6ynKAn3rXKKXAqoAP5ik8TqV91swMSjsQqHVd1vER9oV");

#[program]
pub mod q3_25_escrow {
    use super::*;

    pub fn initialize(ctx: Context<Make>, seed: u64, amount: u64, receive: u64) -> Result<()> {
        ctx.accounts.init_escrow(receive, seed, &ctx.bumps)?;
        ctx.accounts.deposit(amount)?;
        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        ctx.accounts.refund_and_close_vault()?;

        Ok(())
    }

    pub fn take(ctx: Context<Take>) -> Result<()> {
        ctx.accounts.deposit()?;
        ctx.accounts.transfer_and_close_vault()?;

        Ok(())
    }
}
